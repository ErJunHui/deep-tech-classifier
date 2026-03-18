"""
LLM provider abstraction — switch between Anthropic and Gemini via config.json.

Usage:
    from pipeline.llm_provider import build_provider, get_cost_rates

    provider = build_provider(config, api_keys)
    response = provider.complete(messages, system, max_tokens, temperature)
    response, sources = provider.complete_with_search(messages, system, max_tokens, temperature, max_searches)
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class LLMProviderError(Exception):
    """Base error raised by LLM providers after all retries are exhausted."""


class ProviderRateLimitError(LLMProviderError):
    """Rate limit hit after retries."""


class ProviderConnectionError(LLMProviderError):
    """API connection / server error after retries."""


# ---------------------------------------------------------------------------
# Response dataclass
# ---------------------------------------------------------------------------

@dataclass
class LLMResponse:
    text: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    stop_reason: str = "end_turn"
    searches: int = 0


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class LLMProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str: ...

    @property
    @abstractmethod
    def model_name(self) -> str: ...

    @property
    def supports_batching(self) -> bool:
        """True only for Anthropic — Gemini has no batch API equivalent."""
        return False

    @abstractmethod
    def complete(
        self,
        messages: List[Dict],
        system: Any,
        max_tokens: int,
        temperature: float,
    ) -> LLMResponse:
        """Single-turn completion (no tools)."""
        ...

    @abstractmethod
    def complete_with_search(
        self,
        messages: List[Dict],
        system: Any,
        max_tokens: int,
        temperature: float,
        max_searches: int,
        force_json_prompt: Optional[str] = None,
    ) -> Tuple[LLMResponse, List[str]]:
        """
        Run a web-search-enabled conversation loop.

        Args:
            force_json_prompt: If provided and the model didn't return a JSON
                               object, one extra call is made with this prompt
                               appended to coerce a JSON response.

        Returns:
            (LLMResponse, source_urls)
            LLMResponse.text is the final text (ideally a JSON string).
            source_urls lists URLs found in text + search queries executed.
        """
        ...


# ---------------------------------------------------------------------------
# Helpers shared by providers
# ---------------------------------------------------------------------------

_URL_PATTERN = re.compile(r'https?://[^\s\'"<>]+')


def _extract_json(text: str) -> str:
    """Try to extract a JSON object string from free text. Returns '' on failure."""
    if not text or not text.strip():
        return ""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        inner = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        stripped = "\n".join(inner).strip()
    try:
        json.loads(stripped)
        return stripped
    except (json.JSONDecodeError, ValueError):
        pass
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            json.loads(match.group(0))
            return match.group(0)
        except (json.JSONDecodeError, ValueError):
            pass
    try:
        from json_repair import repair_json
        repaired = repair_json(text)
        if repaired and repaired not in ("null", ""):
            json.loads(repaired)  # validate the repair is parseable
            return repaired
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# Anthropic provider
# ---------------------------------------------------------------------------

class AnthropicProvider(LLMProvider):
    _WEB_SEARCH_TOOL = {"type": "web_search_20250305", "name": "web_search"}

    def __init__(self, api_key: str, model: str):
        import anthropic as _anthropic
        self._client = _anthropic.Anthropic(api_key=api_key)
        self._model = model
        self._anthropic = _anthropic

    @property
    def provider_name(self) -> str:
        return "anthropic"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def supports_batching(self) -> bool:
        return True

    @property
    def raw_client(self):
        """Expose the underlying Anthropic client (needed for batch API calls)."""
        return self._client

    def complete(self, messages, system, max_tokens, temperature) -> LLMResponse:
        _anthropic = self._anthropic
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = self._client.messages.create(
                    model=self._model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=system,
                    messages=messages,
                )
                text = response.content[0].text if response.content else ""
                return LLMResponse(
                    text=text,
                    input_tokens=getattr(response.usage, "input_tokens", 0),
                    output_tokens=getattr(response.usage, "output_tokens", 0),
                    cache_read_tokens=getattr(response.usage, "cache_read_input_tokens", 0),
                    cache_write_tokens=getattr(response.usage, "cache_creation_input_tokens", 0),
                    stop_reason=response.stop_reason or "end_turn",
                )
            except _anthropic.RateLimitError:
                wait = 60 * (attempt + 1)
                logger.warning(f"Rate limit (attempt {attempt + 1}/{max_retries}). Waiting {wait}s.")
                time.sleep(wait)
                if attempt == max_retries - 1:
                    raise ProviderRateLimitError("Rate limit exceeded after retries")
            except (_anthropic.APIConnectionError, _anthropic.InternalServerError) as e:
                wait = 5 * (attempt + 1)
                logger.warning(f"API connection error (attempt {attempt + 1}/{max_retries}): {e}. Waiting {wait}s.")
                time.sleep(wait)
                if attempt == max_retries - 1:
                    raise ProviderConnectionError(str(e))
            except _anthropic.APIError as e:
                raise LLMProviderError(f"Anthropic API error: {e}")
        raise LLMProviderError("complete() exhausted retries without raising")

    def complete_with_search(
        self,
        messages: List[Dict],
        system: Any,
        max_tokens: int,
        temperature: float,
        max_searches: int,
        force_json_prompt: Optional[str] = None,
    ) -> Tuple[LLMResponse, List[str]]:
        """Anthropic tool-use loop with server-side web_search."""
        messages = list(messages)
        searches_done = 0
        sources: List[str] = []
        total_input = total_output = total_cache_read = total_cache_write = 0

        def _accumulate(usage):
            nonlocal total_input, total_output, total_cache_read, total_cache_write
            total_input += getattr(usage, "input_tokens", 0)
            total_output += getattr(usage, "output_tokens", 0)
            total_cache_read += getattr(usage, "cache_read_input_tokens", 0)
            total_cache_write += getattr(usage, "cache_creation_input_tokens", 0)

        def _collect_urls(content):
            for block in content:
                if block.type == "text":
                    for url in _URL_PATTERN.findall(block.text):
                        clean = url.rstrip(".,;:)")
                        if clean not in sources:
                            sources.append(clean)

        def _make_response(text: str) -> LLMResponse:
            return LLMResponse(
                text=text,
                input_tokens=total_input,
                output_tokens=total_output,
                cache_read_tokens=total_cache_read,
                cache_write_tokens=total_cache_write,
                searches=searches_done,
            )

        def _try_force_json(current_msgs: List, last_content) -> str:
            """One extra call to coerce a JSON response, if force_json_prompt is set."""
            if not force_json_prompt:
                return ""
            force_msgs = current_msgs + [
                {"role": "assistant", "content": last_content},
                {"role": "user", "content": force_json_prompt},
            ]
            fr = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                messages=force_msgs,
            )
            _accumulate(fr.usage)
            texts = [b for b in fr.content if b.type == "text"]
            return _extract_json("\n".join(b.text for b in texts))

        while True:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                tools=[self._WEB_SEARCH_TOOL],
                messages=messages,
            )
            _accumulate(response.usage)
            _collect_urls(response.content)

            tool_uses = [b for b in response.content if b.type == "tool_use"]

            if not tool_uses or response.stop_reason == "end_turn":
                text_blocks = [b for b in response.content if b.type == "text"]
                all_text = "\n".join(b.text for b in text_blocks)
                final_text = _extract_json(all_text)
                if not final_text:
                    final_text = _try_force_json(messages, response.content)
                return _make_response(final_text), sources

            if searches_done >= max_searches:
                logger.info(f"Reached max_searches={max_searches}, forcing final answer.")
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": (
                    f"You have performed {searches_done} searches (the maximum). "
                    "Now provide your final answer based on what you found."
                )})
                final_response = self._client.messages.create(
                    model=self._model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=system,
                    messages=messages,
                )
                _accumulate(final_response.usage)
                text_blocks = [b for b in final_response.content if b.type == "text"]
                all_text = "\n".join(b.text for b in text_blocks)
                final_text = _extract_json(all_text)
                if not final_text:
                    final_text = _try_force_json(messages, final_response.content)
                return _make_response(final_text), sources

            # Process tool uses and continue loop
            tool_results = []
            for tool_use in tool_uses:
                searches_done += 1
                query = tool_use.input.get("query", "") if hasattr(tool_use, "input") else ""
                if query:
                    sources.append(f"[search query] {query}")
                logger.debug(f"Web search: {query!r}")
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use.id,
                    "content": [],  # server-side tool — content populated by API
                })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        try:
            from google import genai as _genai
            self._client = _genai.Client(api_key=api_key)
            self._genai = _genai
        except ImportError:
            raise ImportError(
                "google-genai package is required for Gemini provider. "
                "Install with: pip install google-genai"
            )
        self._model = model

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def supports_batching(self) -> bool:
        return False

    def _system_text(self, system: Any) -> str:
        """Extract plain text from Anthropic-style system (str or list with cache_control)."""
        if isinstance(system, str):
            return system
        if isinstance(system, list):
            return "\n".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in system
            )
        return str(system)

    def _to_gemini_contents(self, messages: List[Dict]) -> List[Dict]:
        """Convert OpenAI-style messages list to Gemini contents format."""
        contents = []
        for msg in messages:
            role = "user" if msg["role"] == "user" else "model"
            content = msg["content"]
            if isinstance(content, str):
                text_part = content
            elif isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            parts.append(part.get("text", ""))
                        elif part.get("type") == "tool_result":
                            parts.append(str(part.get("content", "")))
                    elif hasattr(part, "text"):
                        parts.append(part.text)
                text_part = "\n".join(parts)
            else:
                text_part = str(content)
            contents.append({"role": role, "parts": [{"text": text_part}]})
        return contents

    def _get_usage(self, response) -> Tuple[int, int]:
        usage = getattr(response, "usage_metadata", None)
        input_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        output_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0
        return input_tokens, output_tokens

    def _call_with_backoff(self, fn, max_attempts: int = 3):
        """Call fn(), retrying on 429/RESOURCE_EXHAUSTED using the server-supplied retry delay."""
        for attempt in range(max_attempts):
            try:
                return fn()
            except Exception as e:
                msg = str(e)
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                    m = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", msg)
                    wait = min(int(m.group(1)) if m else 60, 120)
                    if attempt < max_attempts - 1:
                        logger.warning(
                            f"Gemini rate limit (attempt {attempt + 1}/{max_attempts}). "
                            f"Waiting {wait}s (server-specified)."
                        )
                        time.sleep(wait + 2)
                        continue
                    raise ProviderRateLimitError(f"Gemini rate limit after {max_attempts} attempts: {e}") from e
                raise

    def complete(self, messages, system, max_tokens, temperature) -> LLMResponse:
        try:
            from google.genai import types
            config = types.GenerateContentConfig(
                system_instruction=self._system_text(system) or None,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
            contents = self._to_gemini_contents(messages)

            def _call():
                return self._client.models.generate_content(
                    model=self._model, contents=contents, config=config
                )

            response = self._call_with_backoff(_call)
            text = response.text if hasattr(response, "text") else ""
            in_tok, out_tok = self._get_usage(response)
            return LLMResponse(text=text, input_tokens=in_tok, output_tokens=out_tok)
        except (LLMProviderError, ProviderRateLimitError):
            raise
        except Exception as e:
            raise LLMProviderError(f"Gemini API error: {e}") from e

    def complete_with_search(
        self,
        messages: List[Dict],
        system: Any,
        max_tokens: int,
        temperature: float,
        max_searches: int,
        force_json_prompt: Optional[str] = None,
    ) -> Tuple[LLMResponse, List[str]]:
        """Gemini grounding with Google Search (equivalent to Anthropic's web_search tool)."""
        try:
            from google.genai import types
            search_tool = types.Tool(google_search=types.GoogleSearch())
            config = types.GenerateContentConfig(
                system_instruction=self._system_text(system) or None,
                max_output_tokens=max_tokens,
                temperature=temperature,
                tools=[search_tool],
            )
            contents = self._to_gemini_contents(messages)

            def _call():
                return self._client.models.generate_content(
                    model=self._model, contents=contents, config=config
                )

            response = self._call_with_backoff(_call)
            text = response.text if hasattr(response, "text") else ""
            in_tok, out_tok = self._get_usage(response)

            # Extract grounding sources
            sources: List[str] = []
            if hasattr(response, "candidates") and response.candidates:
                candidate = response.candidates[0]
                gm = getattr(candidate, "grounding_metadata", None)
                if gm:
                    for chunk in getattr(gm, "grounding_chunks", []):
                        web = getattr(chunk, "web", None)
                        if web and hasattr(web, "uri"):
                            sources.append(web.uri)

            # If model didn't produce JSON, try force-JSON follow-up
            if not _extract_json(text) and force_json_prompt and text.strip():
                followup_msgs = messages + [
                    {"role": "assistant", "content": text},
                    {"role": "user", "content": force_json_prompt},
                ]
                followup = self.complete(followup_msgs, system, max_tokens, temperature)
                in_tok += followup.input_tokens
                out_tok += followup.output_tokens
                text = followup.text

            searches_count = 1 if sources else 0
            return LLMResponse(text=text, input_tokens=in_tok, output_tokens=out_tok, searches=searches_count), sources
        except (LLMProviderError, ProviderRateLimitError):
            raise
        except Exception as e:
            raise LLMProviderError(f"Gemini API error: {e}") from e


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------

class OpenAIProvider(LLMProvider):
    _SEARCH_MODEL = "gpt-4o-search-preview"

    def __init__(self, api_key: str, model: str):
        try:
            import openai as _openai
            self._client = _openai.OpenAI(api_key=api_key)
            self._openai = _openai
        except ImportError:
            raise ImportError(
                "openai package is required for OpenAI provider. "
                "Install with: pip install openai"
            )
        self._model = model

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def supports_batching(self) -> bool:
        return False

    def _system_text(self, system: Any) -> str:
        """Extract plain text from Anthropic-style system (str or list with cache_control)."""
        if isinstance(system, str):
            return system
        if isinstance(system, list):
            return "\n".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in system
            )
        return str(system)

    def _build_messages(self, messages: List[Dict], system: Any) -> List[Dict]:
        """Convert messages list + system to OpenAI format."""
        result = []
        sys_text = self._system_text(system)
        if sys_text:
            result.append({"role": "system", "content": sys_text})
        for msg in messages:
            content = msg["content"]
            if isinstance(content, list):
                # Flatten list content (Anthropic-style) to plain text
                parts = []
                for part in content:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            parts.append(part.get("text", ""))
                        elif part.get("type") == "tool_result":
                            parts.append(str(part.get("content", "")))
                    elif hasattr(part, "text"):
                        parts.append(part.text)
                content = "\n".join(parts)
            result.append({"role": msg["role"], "content": content})
        return result

    def complete(self, messages, system, max_tokens, temperature) -> LLMResponse:
        max_retries = 3
        oai_messages = self._build_messages(messages, system)
        for attempt in range(max_retries):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=oai_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                text = response.choices[0].message.content or "" if response.choices else ""
                usage = response.usage
                return LLMResponse(
                    text=text,
                    input_tokens=getattr(usage, "prompt_tokens", 0),
                    output_tokens=getattr(usage, "completion_tokens", 0),
                )
            except self._openai.RateLimitError:
                wait = 60 * (attempt + 1)
                logger.warning(f"OpenAI rate limit (attempt {attempt + 1}/{max_retries}). Waiting {wait}s.")
                time.sleep(wait)
                if attempt == max_retries - 1:
                    raise ProviderRateLimitError("OpenAI rate limit exceeded after retries")
            except (self._openai.APIConnectionError, self._openai.InternalServerError) as e:
                wait = 5 * (attempt + 1)
                logger.warning(f"OpenAI connection error (attempt {attempt + 1}/{max_retries}): {e}. Waiting {wait}s.")
                time.sleep(wait)
                if attempt == max_retries - 1:
                    raise ProviderConnectionError(str(e))
            except self._openai.APIError as e:
                raise LLMProviderError(f"OpenAI API error: {e}")
        raise LLMProviderError("complete() exhausted retries without raising")

    def complete_with_search(
        self,
        messages: List[Dict],
        system: Any,
        max_tokens: int,
        temperature: float,
        max_searches: int,
        force_json_prompt: Optional[str] = None,
    ) -> Tuple[LLMResponse, List[str]]:
        """OpenAI web search via gpt-4o-search-preview."""
        search_model = self._SEARCH_MODEL
        oai_messages = self._build_messages(messages, system)
        try:
            response = self._client.chat.completions.create(
                model=search_model,
                messages=oai_messages,
                max_tokens=max_tokens,
            )
            text = response.choices[0].message.content or "" if response.choices else ""
            usage = response.usage

            # Extract source URLs from annotations
            sources: List[str] = []
            if response.choices:
                msg = response.choices[0].message
                annotations = getattr(msg, "annotations", None) or []
                for ann in annotations:
                    url = getattr(ann, "url", None)
                    if url and url not in sources:
                        sources.append(url)

            # Also extract any URLs from the text
            for url in _URL_PATTERN.findall(text):
                clean = url.rstrip(".,;:)")
                if clean not in sources:
                    sources.append(clean)

            final_text = _extract_json(text)

            # If no JSON and force_json_prompt is set, do a follow-up with regular model
            if not final_text and force_json_prompt and text.strip():
                followup_messages = oai_messages + [
                    {"role": "assistant", "content": text},
                    {"role": "user", "content": force_json_prompt},
                ]
                fr = self._client.chat.completions.create(
                    model=self._model,
                    messages=followup_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                fr_text = fr.choices[0].message.content or "" if fr.choices else ""
                final_text = _extract_json(fr_text)
                if fr.usage:
                    usage_in = getattr(usage, "prompt_tokens", 0) + getattr(fr.usage, "prompt_tokens", 0)
                    usage_out = getattr(usage, "completion_tokens", 0) + getattr(fr.usage, "completion_tokens", 0)
                else:
                    usage_in = getattr(usage, "prompt_tokens", 0)
                    usage_out = getattr(usage, "completion_tokens", 0)
            else:
                usage_in = getattr(usage, "prompt_tokens", 0)
                usage_out = getattr(usage, "completion_tokens", 0)

            return LLMResponse(
                text=final_text,
                input_tokens=usage_in,
                output_tokens=usage_out,
                searches=1,
            ), sources
        except self._openai.APIError as e:
            raise LLMProviderError(f"OpenAI API error: {e}") from e


# ---------------------------------------------------------------------------
# Cost rates
# ---------------------------------------------------------------------------

# USD per token (not per million)
COST_RATES: Dict[str, Dict[str, float]] = {
    "claude-haiku-4-5-20251001": {
        "input":       0.80 / 1_000_000,
        "output":      4.00 / 1_000_000,
        "cache_write": 1.00 / 1_000_000,
        "cache_read":  0.08 / 1_000_000,
        "web_search":  10.00 / 1_000,
    },
    "claude-haiku-4-5": {
        "input":       0.80 / 1_000_000,
        "output":      4.00 / 1_000_000,
        "cache_write": 1.00 / 1_000_000,
        "cache_read":  0.08 / 1_000_000,
        "web_search":  10.00 / 1_000,
    },
    "claude-sonnet-4-6": {
        "input":       3.00 / 1_000_000,
        "output":      15.00 / 1_000_000,
        "cache_write": 3.75 / 1_000_000,
        "cache_read":  0.30 / 1_000_000,
        "web_search":  10.00 / 1_000,
    },
    "gemini-2.5-flash": {
        "input":       0.15 / 1_000_000,   # $0.15/1M tokens
        "output":      0.60 / 1_000_000,   # $0.60/1M tokens
        "cache_write": 0.0,
        "cache_read":  0.0,
        "web_search":  35.00 / 1_000,      # $35/1,000 Google Search grounding requests
    },
    "gemini-2.5-pro": {
        "input":       1.25 / 1_000_000,
        "output":      10.00 / 1_000_000,
        "cache_write": 0.0,
        "cache_read":  0.0,
        "web_search":  35.00 / 1_000,
    },
    "gemini-2.0-flash": {
        "input":       0.10 / 1_000_000,
        "output":      0.40 / 1_000_000,
        "cache_write": 0.0,
        "cache_read":  0.0,
        "web_search":  35.00 / 1_000,
    },
    "gpt-4o-mini": {
        "input":       0.15 / 1_000_000,
        "output":      0.60 / 1_000_000,
        "cache_write": 0.0,
        "cache_read":  0.0,
    },
    "gpt-4o": {
        "input":       2.50 / 1_000_000,
        "output":      10.00 / 1_000_000,
        "cache_write": 0.0,
        "cache_read":  0.0,
    },
    "gpt-4o-search-preview": {
        "input":       2.50 / 1_000_000,
        "output":      10.00 / 1_000_000,
        "cache_write": 0.0,
        "cache_read":  0.0,
    },
}

_DEFAULT_RATES: Dict[str, float] = {
    "input":       1.00 / 1_000_000,
    "output":      5.00 / 1_000_000,
    "cache_write": 0.0,
    "cache_read":  0.0,
}


def get_cost_rates(model: str) -> Dict[str, float]:
    """Return cost rates for a model (USD per token). Falls back to defaults."""
    if model in COST_RATES:
        return COST_RATES[model]
    # Prefix/substring match
    for key in COST_RATES:
        if model.startswith(key) or key.startswith(model):
            return COST_RATES[key]
    logger.warning(f"No cost rates found for model '{model}', using defaults.")
    return _DEFAULT_RATES


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def build_provider(config: Dict[str, Any], api_keys: Optional[Dict[str, str]] = None) -> LLMProvider:
    """
    Build an LLM provider from config.

    Args:
        config: Loaded pipeline config dict (from load_settings).
        api_keys: Optional dict with keys "anthropic" and/or "gemini".
                  Falls back to config["anthropic_api_key"] / config["gemini_api_key"].
    """
    llm_cfg = config.get("llm", {})
    provider_name = llm_cfg.get("provider", "anthropic")
    model = llm_cfg.get("model", "claude-haiku-4-5-20251001")

    if api_keys is None:
        api_keys = {}

    if provider_name == "anthropic":
        api_key = api_keys.get("anthropic") or os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for the anthropic provider.")
        return AnthropicProvider(api_key=api_key, model=model)

    elif provider_name == "gemini":
        api_key = api_keys.get("gemini") or os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required for the gemini provider.")
        return GeminiProvider(api_key=api_key, model=model)

    elif provider_name == "openai":
        api_key = api_keys.get("openai_key") or os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for the openai provider.")
        return OpenAIProvider(api_key=api_key, model=model)

    else:
        raise ValueError(
            f"Unknown provider {provider_name!r}. "
            "Supported values: 'anthropic', 'gemini', 'openai'."
        )
