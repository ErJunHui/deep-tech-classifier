# Deep Tech Classification Pipeline

Classifies Singapore startups as **deep tech** or **general tech** from a spreadsheet of company names. Each company is checked against EPO patent data, classified by an LLM, and — when the result is uncertain — challenged by a second LLM pass that searches the web. The output is a colour-coded Excel workbook with a verdict, confidence score, reasoning and a review flag per company.

For the classification criteria, scoring rules and background, see [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md).

## How it works

| Step | What happens |
|---|---|
| 1. Enrichment (Agent 0) | Searches the web for a current description of the company. If one is found, it is used instead of the description in the input file. |
| 2. Patent lookup | Looks the company up in the EPO patent database and rates its patent portfolio (CPC codes, deep tech level). |
| 3. Classification (Agent 1) | An LLM classifies the company against three criteria: innovation, scientific foundation, proprietary IP. |
| 4. Confidence scoring | Starts from the classifier's confidence and adjusts it for patent evidence, up if the patents agree with the verdict and down if they contradict it. |
| 5. Validation (Agent 2) | Runs only when confidence is below `validation.validator_threshold`. A second LLM pass searches the web, then confirms, overrides or escalates the verdict. |

## Setup

Requires Python 3.10 or later.

```bash
pip install -r requirements.txt
```

```bash
cp .env.template .env
```

```bash
cp config.template.json config.json
```

Then:

1. Put your API keys in `.env` (see [Credentials](#credentials)).
2. In `config.json`, set `llm.provider` and `llm.model`, and make the `pipeline.*_column` names match your input file.

Neither `.env` nor `config.json` is committed to git.

### Credentials

| Variable | Needed when |
|---|---|
| `ANTHROPIC_API_KEY` | `llm.provider` is `"anthropic"` |
| `GEMINI_API_KEY` | `llm.provider` is `"gemini"` |
| `OPENAI_API_KEY` | `llm.provider` is `"openai"` |
| `EPO_KEY`, `EPO_SECRET` | `epo.enabled` is `true`. Register at [ops.epo.org](https://ops.epo.org). |

If the EPO keys are missing, the run continues without patent data.

## Input file

An Excel (`.xlsx`, `.xls`) or CSV file with one row per company. Column headers are matched case-insensitively.

| Column | Required | Header |
|---|---|---|
| Company name | Yes | `pipeline.company_name_column` (default `company_name`) |
| Description | No | `pipeline.description_column` (default `description`) |
| Domain / industry | No | `pipeline.domain_column` (default `domain`) |
| UEN | No | `pipeline.uen_column` (default `uen`) |
| Location, funding | No | `location`, `funding_rounds`, `funding_amount` (fixed names) |

Rows with an empty company name are skipped. All other columns are carried through to the output unchanged.

## Running

```bash
python classify.py --input companies.xlsx
```

| Flag | Purpose |
|---|---|
| `--input`, `-i` | Input file. Overrides `pipeline.input_file`. |
| `--output`, `-o` | Output folder. Defaults to the input file's folder. |
| `--resume`, `-r` | Continue the last interrupted run. |
| `--company-col`, `--desc-col`, `--domain-col`, `--uen-col` | Override the column names in `config.json`. |
| `--config`, `-c` | Path to a different `config.json`. |
| `--env` | Path to a different `.env`. |
| `--log-level` | `DEBUG`, `INFO` (default), `WARNING` or `ERROR`. |

Logs go to the console and to `logs/classify.log`.

### Resuming an interrupted run

```bash
python classify.py --input companies.xlsx --resume
```

Progress is saved to `checkpoints/` after every company, so a resumed run continues at the next unfinished one.

- Resume with the **same input file**. Checkpoints are keyed by row position, and the run stops with an error if the rows no longer match.
- Companies that ended in an error are retried.
- Pressing Ctrl-C writes the companies finished so far to the output file.
- `checkpoints/` and `logs/` are created in the folder you run the command from, so resume from that same folder.

## Output

Results are written to `<input name>_classified_<timestamp>.xlsx` with four sheets:

| Sheet | Contents |
|---|---|
| Overview | Totals, confidence breakdown, escalations and run details. |
| Management View | One row per company: verdict, the three criteria, confidence, risk flag and action. Cases needing review are listed first. |
| Full Detail | Every original column plus all pipeline fields, including reasoning, patent data, validator findings, token counts and cost. |
| Legend | What every column, colour and label means. |

The **Risk Flag** tells a reviewer where to look:

| Risk Flag | Meaning | Action |
|---|---|---|
| Clear | The verdict stands without open questions. | Approve (deep tech) or Reject (general tech) |
| Uncertain | The validator ran and confidence is still below 70. | Needs Review |
| Contested | The validator disagreed but was not confident enough to change the verdict. | Needs Review |
| Escalate | The validator found the evidence contradictory or insufficient. | Needs Review |

**Confidence** is the likelihood that the chosen verdict is correct (0–100). The exact rules are in [PROJECT_OVERVIEW.md §7](PROJECT_OVERVIEW.md#7-confidence-scoring).

## Configuration reference

All settings live in `config.json`. Defaults below are those in `config.template.json`.

### `pipeline`

| Field | Default | Description |
|---|---|---|
| `input_file` | `"companies.xlsx"` | Input file used when `--input` is not given |
| `company_name_column` | `"company_name"` | Header of the company name column |
| `description_column` | `"description"` | Header of the description column |
| `domain_column` | `"domain"` | Header of the domain/industry column |
| `uen_column` | `"uen"` | Header of the UEN column |
| `checkpoint_interval` | `10` | Refresh the output Excel file every N companies |

### `llm`

| Field | Default | Description |
|---|---|---|
| `provider` | `"anthropic"` | `"anthropic"`, `"gemini"` or `"openai"` |
| `model` | `"claude-haiku-5-5"` | Pins an exact model; must belong to the provider. Set to `null` to let `tier` choose |
| `tier` | `"fast"` | `"fast"`, `"balanced"` or `"best"`. Used only when `model` is `null`: picks the first tested model for the tier that the provider still serves |
| `max_tokens_classifier` | `2000` | Max output tokens for the classifier |
| `max_tokens_validator` | `2000` | Max output tokens for the validator |
| `temperature` | `0.1` | Sampling temperature |
| `max_retries_on_parse_error` | `2` | Retries when the classifier returns invalid JSON |

### `enrichment`

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Search the web for a company description before classifying |
| `max_searches` | `2` | Max web searches per company |
| `max_tokens` | `1000` | Max output tokens for the enrichment step |

### `epo`

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Look up patents in the EPO database |
| `epo_package_dir` | `"./lib/epo_patent"` | Location of the bundled EPO package; relative paths are resolved from the project folder |

### `confidence`

| Field | Default | Description |
|---|---|---|
| `epo_adjust_max` | `15` | Max points patent evidence adds when it agrees with the verdict, or subtracts when it contradicts it |
| `low_evidence_cap` | `60` | Confidence ceiling when a company has no description and no patents |

### `validation`

| Field | Default | Description |
|---|---|---|
| `validator_enabled` | `true` | Run the validator on low-confidence results |
| `validator_threshold` | `70` | Run the validator when confidence is below this |
| `max_web_searches` | `3` | Max web searches per validated company |
| `override_min_confidence` | `65` | The validator may change the verdict only if its own confidence is at least this |

### `batch`

| Field | Default | Description |
|---|---|---|
| `enabled` | `true` | Classify all companies in one Anthropic batch job (about half the classifier cost, but results can take up to an hour or more) |
| `batch_poll_interval_s` | `30` | Seconds between checks on the batch job |

## LLM providers

| Provider | Example models | Batch mode | Web search |
|---|---|---|---|
| `"anthropic"` | `claude-haiku-5-5`, `claude-sonnet-5-5` | Yes | Anthropic web search tool |
| `"gemini"` | `gemini-2.5-flash`, `gemini-2.5-pro` | No | Google Search grounding |
| `"openai"` | `gpt-4o-mini`, `gpt-4o` | No | `gpt-4o-search-preview` |

With Gemini or OpenAI, `batch.enabled` is ignored and companies are processed one at a time.

To run without patent data or web search, turn the steps off:

```json
"epo": { "enabled": false },
"enrichment": { "enabled": false },
"validation": { "validator_enabled": false }
```

## Cost

The `total_cost_usd` column and the run summary are estimates from token and web-search counts, using the price table in `pipeline/llm_provider.py`. Check that table against your provider's current prices before relying on the figures; models not in the table fall back to a generic rate.

Web searches (enrichment and validation) are usually the largest part of the bill. Lowering `validation.validator_threshold` or disabling `enrichment` reduces them.

## Tests

The tests need no API keys or network access:

```bash
python -m unittest discover tests
```

## Project layout

```
classify.py              Command-line entry point
config.template.json     Settings template — copy to config.json
.env.template            Credentials template — copy to .env
agents/
  enrichment_agent.py    Agent 0: web description lookup
  classifier_agent.py    Agent 1: classification prompt and parsing
  validator_agent.py     Agent 2: web-search validation
pipeline/
  orchestrator.py        Runs the steps, checkpoints and resume
  confidence.py          Confidence scoring and validator verdict rules
  llm_provider.py        Anthropic / Gemini / OpenAI clients and price table
  epo_bridge.py          Adapter to the bundled EPO package
  json_utils.py          Parsing JSON out of model responses
  settings.py            Loads config.json and .env
data/
  reader.py              Reads the input spreadsheet
  writer.py              Writes the Excel workbook
lib/epo_patent/          Bundled EPO patent search package
tests/                   Unit and regression tests
```
