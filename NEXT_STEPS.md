# Next Steps: Remove Hardcoded Model Names

## Goal

Stop hardcoding specific model versions (e.g. `claude-haiku-4-5-20251001`, `gemini-2.5-flash`, `gpt-4o-mini`) so the pipeline keeps working when providers retire models, and can move to newer models with a one-line change.

Users choose a **tier** (`fast`, `balanced`, `best`). The pipeline resolves it to a concrete model at startup. Pinning an exact model stays available for runs that must be reproducible.

## Background: what each provider supports

| Provider  | "Latest" mechanism | How to resolve |
| --------- | ------------------ | -------------- |
| Gemini    | Moving aliases: `gemini-flash-latest`, `gemini-pro-latest`, `gemini-flash-lite-latest`. Google gives 2 weeks' email notice before the model behind an alias changes. The alias may point to a preview release. | Map tier to alias, then record the concrete version the API reports. |
| Anthropic | Undated aliases (e.g. `claude-sonnet-4-6`) are tied to one version. Nothing jumps across generations. | `GET /v1/models` says which models are still served. |
| OpenAI    | `*-chat-latest` aliases follow ChatGPT's chat model, which is not ideal for structured pipelines. | `GET /v1/models` says which models are still served. It has no capability metadata. |

## Why not just pick the newest model in a family?

A new model generation changes more than its name. The request format changes too, so code written for one generation can fail on the next. Examples from the Anthropic API today:

- **Temperature:** every call in this pipeline sends `temperature` (default 0.1). `claude-haiku-5-5` and `claude-sonnet-5-5` reject non-default values with a 400. The current Opus models reject the parameter entirely.
- **Thinking:** it is on by default on newer models and counts against `max_tokens`. The classifier's 2000–3000 token budget could cut off the JSON verdict.
- **Refusals:** newer models can return `stop_reason: "refusal"`, which `pipeline/llm_provider.py` does not handle.
- **Web-search tool version:** `web_search_20250305` vs `web_search_20260209` depends on which model is called. No endpoint reports this.

So "take the newest model whose ID contains `haiku`" would select `claude-haiku-5-5` today and fail on the first call.

**Approach used in this plan:** each tier has an ordered list of **tested candidates**. The resolver takes the first candidate the provider still serves. A retirement falls through to the next candidate automatically, and the pipeline never jumps to a generation nobody has run. Supporting a new model is one new entry in `pipeline/models.py`, with any request settings it needs.

## Principles

- **Backward compatible:** an existing `config.json` with `llm.model` set must behave exactly as it does today.
- **Only tested models:** auto-resolution chooses from the candidate list, never from whatever the provider lists as newest.
- **One model per run:** resolve once at startup, and never switch models mid-run (including across `--resume`).
- **Always record:** every output file states which exact model produced it, as reported by the API.
- **Small steps:** one commit or PR per step, each leaving the tests passing.

---

## Step 1: Inventory hardcoded model references

- [ ] Run the test suite (`python -m unittest discover tests`) and confirm it passes before changing anything.
- [ ] Search the repo for `claude-`, `gemini-`, `gpt-`, `search-preview` and `web_search_`.
- [ ] Note each location found. Known places:
  - [ ] `config.template.json` (`llm.model`)
  - [ ] `pipeline/llm_provider.py` (price table, `_WEB_SEARCH_TOOL`, `_SEARCH_MODEL`, default in `build_provider`)
  - [ ] `pipeline/orchestrator.py` (default model in the batch path)
  - [ ] `agents/classifier_agent.py` (default model, two places)
  - [ ] `agents/enrichment_agent.py` (docstring)
  - [ ] `data/writer.py` (legend text naming claude-haiku and its rates)
  - [ ] `tests/test_fixes.py` (fixtures and expected model names)
  - [ ] `README.md` and `PROJECT_OVERVIEW.md` (provider table, config reference)

**Done when:** you have a complete list of every place a model or tool version is named.

## Step 2: Move all model choices into one module (refactor only)

- [ ] Create `pipeline/models.py` holding, per provider:
  - the ordered candidate list for each tier (`fast`, `balanced`, `best`), starting with just the current model
  - search model (OpenAI)
  - a **profile** per model: the request settings that model needs (see below)
- [ ] Profile fields to start with:
  - whether `temperature` may be sent
  - web-search tool version (Anthropic)
  - thinking setting and any extra `max_tokens` headroom
  - which token-limit parameter to use (OpenAI)
- [ ] For now, the profiles describe the **current** models only, so behaviour does not change.
- [ ] Update `llm_provider.py`, `orchestrator.py` and the agents to read from `pipeline/models.py` instead of their own strings.
- [ ] Remove the four copies of the default `llm_cfg.get("model", "claude-haiku-4-5-20251001")` (`orchestrator.py`, `classifier_agent.py` twice, `llm_provider.py`). With `"model": null` in the config, `.get` returns `None` rather than the default, so each call site must go through one function in `models.py`.
- [ ] Run the tests. They should pass unchanged.

**Done when:** no model name appears anywhere outside `pipeline/models.py`, `config.template.json`, the tests and the docs.

## Step 3: Add the resolver

- [ ] Add `llm.tier` to `config.template.json` and `pipeline/settings.py`. Keep `llm.model` in the template pinned to the current model until Step 5 is done.
- [ ] Resolution order:
  1. If `llm.model` is set, use it as-is (pinned). If it has no profile, use the profile of the current default and log a warning.
  2. Anthropic and OpenAI: list the models the API serves, then take the first candidate for the tier that appears in the list. When `batch.enabled` is true, skip candidates that do not support batch.
  3. Gemini: map tier to `gemini-flash-lite-latest` / `gemini-flash-latest` / `gemini-pro-latest`.
- [ ] Resolve the OpenAI search model the same way, from its own candidate list.
- [ ] The Anthropic web-search tool version comes from the resolved model's profile. It is not resolved separately.
- [ ] Add handling for `stop_reason: "refusal"` in the Anthropic provider, so a refusal is reported as a row error rather than parsed as an empty answer.
- [ ] Resolve **once** at startup, before any company is processed.
- [ ] After resolving, make one small test call (a few tokens, using the model's profile). A model that is listed but rejects the request then fails at startup, not at company 1.
- [ ] If no candidate is available, fail fast with a clear error that lists the candidates tried and the models the API returned, so the user can pin one.
- [ ] Tests: mock the list endpoints so tests still need no API keys or network. Cover pinned model, each provider, first candidate retired (falls through to the second), no candidate available, and batch filtering.

Sketch (Anthropic):

```python
CANDIDATES = {
    "fast":     ["claude-haiku-4-5"],
    "balanced": ["claude-sonnet-4-6"],
    "best":     ["claude-opus-4-6"],
}

def resolve_anthropic(client, tier, need_batch):
    served = {m.id: m for m in client.models.list()}  # auto-paginates
    for model_id in CANDIDATES[tier]:
        if model_id in served and (not need_batch or PROFILES[model_id].batch):
            return model_id
    raise RuntimeError(
        f"No tested Anthropic model is available for tier '{tier}'. "
        f"Tried {CANDIDATES[tier]}; the API serves {sorted(served)}. "
        "Set llm.model to pin one."
    )
```

To check before coding:

- Whether the Anthropic `/v1/models` response reports batch support. `capabilities` is a nested dict (`m.capabilities["..."]["supported"]`), not an object. If there is no batch flag, keep it in the profile as the sketch does.
- Whether newer OpenAI models need a different token-limit parameter and restrict `temperature`, and what replaces `gpt-4o-search-preview`. The replacement may be a different API rather than a new model name, which would be a code change in `OpenAIProvider`.

**Done when:** `"model": null, "tier": "fast"` runs end to end on each provider, retiring the first candidate in a test falls through to the second, and old configs still work.

## Step 4: Lock the model for the whole run

- [ ] Save the resolved model ID(s) in run-level state in `checkpoints/`. Batch mode already has `checkpoints/run_state.json`. Sequential mode only has the per-row JSONL, so give it the same run-state file.
- [ ] On `--resume`, reuse the checkpointed model instead of resolving again. If the user has since pinned a different model, stop with an error rather than mixing models in one output.
- [ ] Batch mode: a batch already submitted before the interruption keeps the model it was submitted with. Check the run state matches before collecting its results.
- [ ] Record the model the API reports in each response (Anthropic `response.model`; Gemini's reported model version, to be confirmed in the SDK), not the name that was requested. This matters for Gemini, where the alias can be repointed between a run and its resume.
- [ ] Gemini: if the reported version changes during a run or on resume, stop with an error that names both versions.
- [ ] Log the resolved model at startup.
- [ ] Add the resolved model(s) to the **Overview** sheet (`data/writer.py`) and to the **Full Detail** sheet per row.

**Done when:** an interrupted run resumed after a new model release still uses the original model, and every output file names the model the API reported.

## Step 5: Add a reference set to catch drift

Do this before making tier the default. It is the only check that a newly added candidate classifies the same way as the old one.

- [ ] Pick 15–20 companies whose correct verdict is certain, with a mix of deep tech and general tech, and some borderline cases.
- [ ] Save them as `tests/reference/companies.xlsx` with an `expected_verdict` column.
- [ ] Add a script (e.g. `python -m tests.reference.check`) that runs the pipeline on them and reports agreement and any changed verdicts.
- [ ] Decide the pass threshold up front (e.g. all certain cases correct, at most one borderline case changed). Web search makes verdicts vary between runs, so run the current model two or three times first to see how much it varies on its own.
- [ ] Store the last model that passed in `tests/reference/last_validated.json`, one entry per provider. For Gemini, store the reported version, not the alias.
- [ ] At startup, if the resolved model differs from the last validated one for that provider, print a warning suggesting the user run the check.
- [ ] Rule for `pipeline/models.py`: a model is added to a candidate list only after it passes the check.
- [ ] Once the check exists and passes, change `config.template.json` to `"model": null, "tier": "fast"`.

**Done when:** switching to a new model triggers a visible prompt to re-validate, the check gives a clear pass/fail, and the template no longer names a model.

## Step 6: Make cost estimates honest

Family-level pricing is not safe: Haiku 4.5 costs $1 / $5 per million tokens and Haiku 5.5 costs $0.10 / $0.50, so a "any haiku" fallback would be off by 10x.

- [ ] Keep prices per exact model, stored next to the model's profile in `pipeline/models.py`. Adding a candidate then means adding its price.
- [ ] When the model is not in the table (a pinned model, or a Gemini alias pointing at a new version), show the cost as "unknown (no price for <model>)" in the run summary and Overview sheet, with token counts so the user can work it out. Do not fall back to another model's rates.
- [ ] Replace the loose match in `get_cost_rates` (`model.startswith(key) or key.startswith(model)`) with an exact match plus the dated-snapshot form of the same model.
- [ ] Fix the legend in `data/writer.py`, which says $0.80 / $4.00 while the table says $1 / $5, and generate it from the resolved model's rates.

**Done when:** a model without a price shows "unknown" with its token counts, and no cost figure is ever computed from another model's rates.

## Step 7: Update documentation

- [ ] `README.md`: replace the `llm.model` row with `llm.tier` and `llm.model`, and update the "LLM providers" table to show tiers instead of example model names.
- [ ] Explain when to pin a model: audits, reports that will be compared over time, or reproducing an earlier run.
- [ ] Document how to add a new model: add its profile and price, run the reference check, then add it to the front of the tier's candidate list.
- [ ] Document the reference check and when to run it.
- [ ] `PROJECT_OVERVIEW.md`: note that the classifier model can change over time and how this is tracked.

**Done when:** a new user can set up the pipeline without knowing any model names, and a maintainer can add a model by following the README.

---

## Suggested order and effort

| Step | Effort | Risk |
| ---- | ------ | ---- |
| 1–2  | ~2 hours | Low (refactor only) |
| 3–4  | ~half a day | Medium (core change) |
| 5    | ~half a day, mostly choosing companies | Low |
| 6    | ~1 hour | Low |
| 7    | ~1 hour | Low |

Steps 1–4 make the pipeline survive a model retirement while the template stays pinned. Step 5 is required before tier becomes the default. Steps 6–7 can follow over the next few days.
