# Deep Tech Classification Pipeline

Classifies Singapore startups as **deep tech** or **general tech** using LLM reasoning + EPO patent data + optional web search validation.

---

## Requirements

- Python 3.9+
- API key for your chosen LLM provider (Anthropic, Gemini, or OpenAI)
- EPO OPS API credentials (optional — needed only when `epo.enabled = true`)

Install dependencies:
```bash
pip install -r requirements.txt
```

---

## Quick Start

```bash
# 1. Set up credentials
cp .env.template .env
# Edit .env and fill in your API keys

# 2. Set up config
cp config.template.json config.json
# Edit config.json — at minimum set pipeline.company_name_column to match your input file

# 3. Run
python classify.py --input companies.xlsx
```

---

## Configuration Reference

All settings live in `config.json`.

### `pipeline`

| Field | Type | Default | Description |
|---|---|---|---|
| `input_file` | string | `"companies.xlsx"` | Default input file (overridden by `--input`) |
| `company_name_column` | string | `"company_name"` | Column header for company names |
| `description_column` | string | `"description"` | Column header for company descriptions |
| `domain_column` | string | `"domain"` | Column header for domain/industry |
| `uen_column` | string | `"uen"` | Column header for UEN (optional) |
| `checkpoint_interval` | int | `10` | Save checkpoint every N companies |

### `llm`

| Field | Type | Default | Description |
|---|---|---|---|
| `provider` | string | `"anthropic"` | LLM provider: `"anthropic"`, `"gemini"`, or `"openai"` |
| `model` | string | `"claude-haiku-4-5-20251001"` | Model name (must match provider) |
| `max_tokens_classifier` | int | `2000` | Max output tokens for classifier agent |
| `max_tokens_validator` | int | `2000` | Max output tokens for validator agent |
| `temperature` | float | `0.1` | Sampling temperature |
| `max_retries_on_parse_error` | int | `2` | JSON parse retries before giving up |

### `validation`

| Field | Type | Default | Description |
|---|---|---|---|
| `validator_threshold` | int | `70` | Trigger validator when confidence < this |
| `max_web_searches` | int | `3` | Max web searches per company in validator |
| `validator_enabled` | bool | `true` | Enable/disable validator agent |

### `epo`

| Field | Type | Default | Description |
|---|---|---|---|
| `epo_package_dir` | string | `"./lib/epo_patent"` | Path to EPO patent package |
| `enabled` | bool | `true` | Enable/disable EPO patent search |

### `batch`

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | bool | `true` | Use Anthropic Batch API (Anthropic only, reduces cost ~50%) |
| `batch_poll_interval_s` | int | `30` | Polling interval in seconds |

---

## Column Name Mapping

If your input file uses different column headers, either edit `config.json` or pass CLI flags:

```bash
python classify.py --input data.xlsx \
  --company-col "Company Name" \
  --desc-col "About" \
  --domain-col "Industry" \
  --uen-col "UEN No"
```

CLI flags take precedence over `config.json`.

---

## LLM Providers

| Provider value | Model examples | Required env var |
|---|---|---|
| `"anthropic"` | `claude-haiku-4-5-20251001`, `claude-sonnet-4-6` | `ANTHROPIC_API_KEY` |
| `"gemini"` | `gemini-2.5-pro`, `gemini-2.0-flash` | `GEMINI_API_KEY` |
| `"openai"` | `gpt-4o-mini`, `gpt-4o` | `OPENAI_API_KEY` |

Set the provider and model in `config.json`:
```json
"llm": {
  "provider": "openai",
  "model": "gpt-4o-mini"
}
```

**Note:** Batch API (`batch.enabled`) is only supported for the `anthropic` provider.

---

## EPO Patent Search

The EPO package is bundled in `lib/epo_patent/`. To use it:

1. Obtain EPO OPS API credentials at [ops.epo.org](https://ops.epo.org)
2. Add your credentials to `.env`:
   ```
   EPO_KEY=your_epo_key
   EPO_SECRET=your_epo_secret
   ```

To disable EPO (LLM-only classification):
```json
"epo": { "enabled": false }
```

---

## Resume Interrupted Runs

If a run is interrupted, resume from the last checkpoint:

```bash
python classify.py --resume
```

The pipeline automatically saves progress every `pipeline.checkpoint_interval` companies.

---

## Output

Results are written to an Excel file in the same directory as the input file:
- **Sheet 1 — Results:** one row per company with classification, confidence score, and reasoning
- **Sheet 2 — Summary:** run statistics and cost breakdown
