"""
LLM provider abstraction — switch between Anthropic and Gemini via config.json.

Usage:
    from pipeline.llm_provider import build_provider, get_cost_rates

    provider = build_provider(config, api_keys)
    response = provider.complete(messages, system, max_tokens, temperature)
    response, sources = provider.complete_with_search(messages, system, max_tokens, temperature, max_searches)
"""

from __future__ import annotations

import logging
import os
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from pipeline import model_resolver, models
from pipeline.json_utils import extract_json as _extract_json
from pipeline.models import COST_RATES

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


class LLMRefusalError(LLMProviderError):
    """The model declined the request (stop_reason "refusal")."""


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
    model: str = ""  # model ID the API reported for this response


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

    # How the model was chosen (model_resolver.ResolvedModel); set by build_provider.
    resolution: Optional[model_resolver.ResolvedModel] = None
    # Model ID the API reported in its first response of the run.
    reported_model: Optional[str] = None
    # (first, later) when a later response reported a different model.
    model_drift: Optional[Tuple[str, str]] = None

    @property
    def search_model_name(self) -> Optional[str]:
        """Separate model used for web search, when the provider has one."""
        return None

    def note_model(self, reported: Optional[str]) -> None:
        """Record the model a response reported; flag it if it differs from the first."""
        if not reported:
            return
        if self.reported_model is None:
            self.reported_model = reported
        elif reported != self.reported_model and self.model_drift is None:
            self.model_drift = (self.reported_model, reported)

    def list_model_ids(self) -> List[str]:
        """Model IDs the provider currently serves."""
        raise NotImplementedError(f"{self.provider_name} has no model list")

    def smoke_test(self, temperature: float = 0.1) -> Optional[str]:
        """One tiny call, so an unusable model fails before any company is processed."""
        self.complete(
            messages=[{"role": "user", "content": "Reply with the single word OK."}],
            system="This is a connectivity check.",
            max_tokens=64,
            temperature=temperature,
        )
        return self.reported_model

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


# ---------------------------------------------------------------------------
# Anthropic provider
# ---------------------------------------------------------------------------

class AnthropicProvider(LLMProvider):
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

    def list_model_ids(self) -> List[str]:
        return [m.id for m in self._client.models.list()]

    def _checked(self, response):
        """Record the reported model; turn a refusal into an error."""
        self.note_model(getattr(response, "model", None))
        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            category = getattr(details, "category", None) or "unspecified"
            raise LLMRefusalError(f"The model declined the request (category: {category}).")
        return response

    def _create(self, max_tokens, temperature, **kwargs):
        """messages.create with retries; raises LLMProviderError subclasses on failure.

        max_tokens and temperature are shaped by the model's profile: some
        models reject temperature, and some need room for thinking.
        """
        kwargs.update(models.request_params(self._model, max_tokens, temperature))
        _anthropic = self._anthropic
        max_retries = 3
        for attempt in range(max_retries):
            last = attempt == max_retries - 1
            try:
                return self._checked(self._client.messages.create(model=self._model, **kwargs))
            except _anthropic.RateLimitError as e:
                if last:
                    raise ProviderRateLimitError("Rate limit exceeded after retries") from e
                wait = 60 * (attempt + 1)
                logger.warning(f"Rate limit (attempt {attempt + 1}/{max_retries}). Waiting {wait}s.")
                time.sleep(wait)
            except (_anthropic.APIConnectionError, _anthropic.InternalServerError) as e:
                if last:
                    raise ProviderConnectionError(str(e)) from e
                wait = 5 * (attempt + 1)
                logger.warning(f"API connection error (attempt {attempt + 1}/{max_retries}): {e}. Waiting {wait}s.")
                time.sleep(wait)
            except _anthropic.APIError as e:
                raise LLMProviderError(f"Anthropic API error: {e}") from e
        raise LLMProviderError("Anthropic request exhausted retries without raising")

    @staticmethod
    def _text_of(content) -> str:
        # Web-search answers arrive as several text blocks (split around
        # citations); join without a separator so JSON strings stay intact.
        return "".join(b.text for b in content if getattr(b, "type", None) == "text")

    def complete(self, messages, system, max_tokens, temperature) -> LLMResponse:
        response = self._create(
            max_tokens=max_tokens,
            temperature=temperature,
            system=system,
            messages=messages,
        )
        usage = response.usage
        return LLMResponse(
            text=self._text_of(response.content),
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
            cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            stop_reason=response.stop_reason or "end_turn",
            model=getattr(response, "model", "") or "",
        )

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
        Run a conversation with Anthropic's server-side web_search tool.

        The search runs on Anthropic's side: results come back in the same
        response as server_tool_use / web_search_tool_result blocks, so there is
        no client tool loop. max_searches is enforced by the API via max_uses.
        """
        messages = list(messages)
        search_tool = models.anthropic_web_search_tool(self._model, max(int(max_searches), 1))
        sources: List[str] = []
        totals = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "searches": 0}

        def _accumulate(usage):
            totals["input"] += getattr(usage, "input_tokens", 0) or 0
            totals["output"] += getattr(usage, "output_tokens", 0) or 0
            totals["cache_read"] += getattr(usage, "cache_read_input_tokens", 0) or 0
            totals["cache_write"] += getattr(usage, "cache_creation_input_tokens", 0) or 0
            server_tools = getattr(usage, "server_tool_use", None)
            totals["searches"] += getattr(server_tools, "web_search_requests", 0) or 0

        def _add_source(value: Optional[str]):
            if value and value not in sources:
                sources.append(value)

        def _collect_sources(content):
            for block in content:
                block_type = getattr(block, "type", None)
                if block_type == "server_tool_use":
                    query = (getattr(block, "input", None) or {}).get("query")
                    if query:
                        _add_source(f"[search query] {query}")
                elif block_type == "web_search_tool_result":
                    results = getattr(block, "content", None)
                    if isinstance(results, list):  # an error is a single object, not a list
                        for item in results:
                            _add_source(getattr(item, "url", None))
                    else:
                        logger.warning(
                            f"Web search failed: {getattr(results, 'error_code', 'unknown error')}"
                        )
                elif block_type == "text":
                    for url in _URL_PATTERN.findall(block.text):
                        _add_source(url.rstrip(".,;:)"))

        # A long server-side turn can stop with pause_turn; send it back to continue.
        max_continuations = 5
        for _ in range(max_continuations + 1):
            response = self._create(
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                tools=[search_tool],
                messages=messages,
            )
            _accumulate(response.usage)
            _collect_sources(response.content)
            if response.stop_reason != "pause_turn":
                break
            messages = messages + [{"role": "assistant", "content": response.content}]

        final_text = _extract_json(self._text_of(response.content))

        if not final_text and force_json_prompt:
            followup = list(messages)
            if response.content:
                followup.append({"role": "assistant", "content": response.content})
                followup.append({"role": "user", "content": force_json_prompt})
            else:
                followup.append({"role": "user", "content": force_json_prompt})
            forced = self._create(
                max_tokens=max_tokens,
                temperature=temperature,
                system=system,
                tools=[search_tool],  # must stay declared: the history contains search blocks
                messages=followup,
            )
            _accumulate(forced.usage)
            _collect_sources(forced.content)
            final_text = _extract_json(self._text_of(forced.content))

        return LLMResponse(
            text=final_text,
            input_tokens=totals["input"],
            output_tokens=totals["output"],
            cache_read_tokens=totals["cache_read"],
            cache_write_tokens=totals["cache_write"],
            searches=totals["searches"],
            model=getattr(response, "model", "") or "",
        ), sources


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

    def _reported(self, response) -> str:
        """The concrete model version behind the request (aliases can be repointed)."""
        reported = getattr(response, "model_version", None) or ""
        self.note_model(reported)
        return reported

    def _get_usage(self, response) -> Tuple[int, int]:
        usage = getattr(response, "usage_metadata", None)
        input_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
        output_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0
        # Thinking tokens are billed as output but reported separately.
        thinking_tokens = getattr(usage, "thoughts_token_count", 0) if usage else 0
        return input_tokens or 0, (output_tokens or 0) + (thinking_tokens or 0)

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
            return LLMResponse(
                text=text, input_tokens=in_tok, output_tokens=out_tok,
                model=self._reported(response),
            )
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
            reported = self._reported(response)

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
            return LLMResponse(
                text=text, input_tokens=in_tok, output_tokens=out_tok,
                searches=searches_count, model=reported,
            ), sources
        except (LLMProviderError, ProviderRateLimitError):
            raise
        except Exception as e:
            raise LLMProviderError(f"Gemini API error: {e}") from e


# ---------------------------------------------------------------------------
# OpenAI provider
# ---------------------------------------------------------------------------

class OpenAIProvider(LLMProvider):
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
        self._search_model = models.OPENAI_SEARCH_CANDIDATES[0]

    @property
    def search_model_name(self) -> Optional[str]:
        return self._search_model

    def list_model_ids(self) -> List[str]:
        return [m.id for m in self._client.models.list()]

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
                self.note_model(getattr(response, "model", None))
                return LLMResponse(
                    text=text,
                    input_tokens=getattr(usage, "prompt_tokens", 0),
                    output_tokens=getattr(usage, "completion_tokens", 0),
                    model=getattr(response, "model", "") or "",
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
        """OpenAI web search via the dedicated search model."""
        search_model = self._search_model
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

# Anthropic Message Batches are billed at half the standard token rates.
BATCH_DISCOUNT = 0.5


_warned_unpriced: set = set()


def get_cost_rates(model: str) -> Dict[str, Any]:
    """
    Cost rates for a model (USD per token).

    Only the exact model, or a dated snapshot of it, is priced. Any other model
    gets models.UNKNOWN_RATES: another model's rates are never borrowed, because
    prices differ by 10x within a family.
    """
    rates = COST_RATES.get(model) or COST_RATES.get(models.base_model_id(model))
    if rates is not None:
        return rates
    if model not in _warned_unpriced:
        _warned_unpriced.add(model)
        logger.warning(
            f"No price is listed for model '{model}' in pipeline/models.py. "
            "Its cost will be shown as unknown."
        )
    return dict(models.UNKNOWN_RATES)


def cost_known(rates: Dict[str, Any]) -> bool:
    """False when the rates are the placeholder for an unpriced model."""
    return bool(rates.get("known", True))


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

_PROVIDERS = {
    "anthropic": ("ANTHROPIC_API_KEY", AnthropicProvider),
    "gemini": ("GEMINI_API_KEY", GeminiProvider),
    "openai": ("OPENAI_API_KEY", OpenAIProvider),
}


def build_provider(
    config: Dict[str, Any],
    api_keys: Optional[Dict[str, str]] = None,
    model: Optional[str] = None,
    search_model: Optional[str] = None,
) -> LLMProvider:
    """
    Build an LLM provider from config and choose its model.

    Args:
        config: Loaded pipeline config dict (from load_settings).
        api_keys: Optional dict keyed by provider name. Falls back to the
                  provider's environment variable.
        model: Model locked by a run checkpoint. When given it is used as-is;
               otherwise llm.model (pinned) or llm.tier decides.
        search_model: Web-search model locked by a run checkpoint (OpenAI only).

    Raises:
        model_resolver.ModelSetupError: no usable model for the configured tier.
    """
    llm_cfg = config.get("llm", {})
    provider_name = llm_cfg.get("provider", "anthropic")
    if provider_name not in _PROVIDERS:
        raise ValueError(
            f"Unknown provider {provider_name!r}. "
            "Supported values: 'anthropic', 'gemini', 'openai'."
        )
    env_var, provider_cls = _PROVIDERS[provider_name]
    api_key = (api_keys or {}).get(provider_name) or os.getenv(env_var, "")
    if not api_key:
        raise ValueError(f"{env_var} is required for the {provider_name} provider.")

    provider = provider_cls(api_key=api_key, model=model or "")
    if model:
        resolution = model_resolver.ResolvedModel(model, "checkpoint")
    else:
        need_batch = provider.supports_batching and config.get("batch", {}).get("enabled", True)
        resolution = model_resolver.resolve_model(
            provider=provider_name,
            tier=llm_cfg.get("tier"),
            pinned=models.pinned_model(config),
            need_batch=need_batch,
            list_models=provider.list_model_ids,
        )
    provider._model = resolution.model
    provider.resolution = resolution

    if provider_name == "openai":
        provider._search_model = search_model or model_resolver.resolve_openai_search_model(
            provider.list_model_ids
        )

    logger.info(f"Model: {resolution.model} ({provider_name}, {resolution.describe()})")
    if provider.search_model_name:
        logger.info(f"Web-search model: {provider.search_model_name}")
    return provider
