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
| Overview | Totals, confidence breakdown, escalations, run details, the model that produced the file, token totals and estimated cost. |
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
| `tier` | `"fast"` | `"fast"`, `"balanced"` or `"best"`. The pipeline picks the model for you; see [LLM providers](#llm-providers) |
| `model` | `null` | Leave as `null` to use `tier`. Set an exact model name to pin it; `tier` is then ignored. See [Pinning a model](#pinning-a-model) |
| `max_tokens_classifier` | `2000` | Max output tokens for the classifier |
| `max_tokens_validator` | `2000` | Max output tokens for the validator |
| `temperature` | `0.1` | Sampling temperature. Not sent to models that do not accept it |
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

Choose a provider and a tier. You do not need to know any model names.

| Provider | `fast` | `balanced` | `best` | Batch mode | Web search |
|---|---|---|---|---|---|
| `"anthropic"` | Haiku | Sonnet | Opus | Yes | Anthropic web search tool |
| `"gemini"` | Flash-Lite | Flash | Pro | No | Google Search grounding |
| `"openai"` | GPT-4o mini | GPT-4o | GPT-4o | No | Dedicated search model |

With Gemini or OpenAI, `batch.enabled` is ignored and companies are processed one at a time.

### How the model is chosen

Each tier has a short list of models that have been run through this pipeline, newest first. The lists are in `pipeline/models.py`.

1. At startup the pipeline asks the provider which models it still serves and takes the first one on the tier's list. If a model is retired, the next one is used automatically.
2. One small test call confirms the model answers before any company is processed.
3. The model is saved with the run. `--resume` always continues with the same model, even if a newer one has since been added.
4. The Overview sheet names the model, and the Full Detail sheet has a `model` column per row.

Gemini tiers use Google's moving aliases (`gemini-flash-latest` and similar), which Google repoints to newer versions. The pipeline records the version that actually answered, and stops a run if that version changes partway through.

If no model on the list is available, the run stops with a message listing what was tried and what the provider serves. Pin a model to continue.

### Pinning a model

Set `llm.model` to an exact model name when the output must be reproducible:

- audits;
- reports that will be compared with each other over time;
- reproducing an earlier run (the model is on that run's Overview sheet).

```json
"llm": { "provider": "anthropic", "model": "claude-haiku-5-5" }
```

A pinned model that is not in `pipeline/models.py` still runs, with the original request settings. Its cost is shown as unknown.

### Checking a model against the reference set

`tests/reference/companies.xlsx` holds 20 companies with known verdicts: 16 clear cases and 4 borderline ones. The check runs the pipeline on them and compares the results:

```bash
python -m tests.reference.check
```

This makes real API calls using your `config.json` and `.env`. It passes when every clear case gets its expected verdict and at most one borderline case differs. On a pass, the model is saved in `tests/reference/last_validated.json`; commit that file.

Run it:

- when the pipeline warns at startup that the model differs from the last one validated;
- before adding a model to a tier;
- after changing the classifier or validator prompts.

Web search makes verdicts vary a little between runs. `--runs 3` repeats the check and lists the companies whose verdict changed; `--sequential` skips batch mode for a faster result.

Review the reference companies and their expected verdicts before trusting the check; they should reflect your own reading of the criteria.

### Adding a new model

1. Add a profile for it in `PROFILES` in `pipeline/models.py`: its request settings and its price.
2. Pin it in `config.json` and run the reference check.
3. If it passes, add it to the front of its tier's list in `CANDIDATES` and commit, with `last_validated.json`.

To run without patent data or web search, turn the steps off:

```json
"epo": { "enabled": false },
"enrichment": { "enabled": false },
"validation": { "validator_enabled": false }
```

## Cost

The `total_cost_usd` column, the Overview sheet and the run summary are estimates from token and web-search counts, using the prices in `pipeline/models.py`. Check those prices against your provider's current ones before relying on the figures.

Only models listed there are priced. For any other model the cost is shown as "unknown" and the token totals are given instead; another model's price is never substituted.

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
  llm_provider.py        Anthropic / Gemini / OpenAI clients
  models.py              Model lists per tier, request settings and prices
  model_resolver.py      Chooses the model for a run from tier or pinned name
  validation_record.py   Tracks which model last passed the reference check
  epo_bridge.py          Adapter to the bundled EPO package
  json_utils.py          Parsing JSON out of model responses
  settings.py            Loads config.json and .env
data/
  reader.py              Reads the input spreadsheet
  writer.py              Writes the Excel workbook
lib/epo_patent/          Bundled EPO patent search package
tests/                   Unit and regression tests
  reference/             Reference companies and the live model check
```
