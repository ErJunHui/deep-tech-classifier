# Deep Tech Classification Pipeline — Project Overview

*Prepared for management review. Last updated: 2026-03-16.*

---

## 1. Project Summary

This pipeline automates the classification of Singapore startup companies as **"deep tech"** or **"general tech"** using a combination of patent database lookups and AI-powered analysis. It was built to replace manual screening, which is time-consuming and inconsistent at scale.

**Input:** An Excel or CSV file of company names (with optional descriptions, UENs, and domains).
**Output:** A colour-coded Excel workbook with one row per company, verdict, confidence score, reasoning, and reviewer action flags.

**Primary audience:** Investment teams, grant evaluators, and programme managers who need consistent, defensible deep tech determinations at batch scale.

---

## 2. Deep Tech Classification Criteria

A company qualifies as **deep tech** only if it meets **all three** of the following criteria simultaneously:

| # | Criterion | What it means |
|---|-----------|---------------|
| 1 | **Innovation** | The company creates novel innovations or proprietary technology at the frontier of science or engineering — not merely applying existing tools in new markets. Original R&D is required. |
| 2 | **Scientific Foundation** | The core product is grounded in a hard science or deep engineering discipline: e.g., biology, chemistry, materials science, photonics, semiconductors, quantum computing, aerospace, or novel AI/ML research. SaaS platforms and mobile apps do **not** qualify regardless of domain. |
| 3 | **Proprietary IP** | Meaningful barriers to replication exist — patents, trade secrets, proprietary datasets, or specialised know-how that competitors cannot easily copy. Patents are the strongest evidence; absence is acceptable only if criteria 1 and 2 are strongly met with an alternative IP mechanism. |

### Common Misclassification Guards

- **AI/ML scrutiny:** AI companies qualify only if they conduct original AI research or apply AI to a hard-science domain (drug discovery, materials simulation, genomics). AI-powered SaaS, chatbots, and analytics tools are **general tech**.
- **Domain alone is not sufficient:** A healthcare app, biotech marketplace, or cleantech consultancy is not deep tech just because it operates in a deep tech sector.
- **Hardware integration ≠ deep tech:** Assembling IoT devices from off-the-shelf components is not deep tech. Hardware qualifies only if the company invented a novel physical mechanism, material, or fabrication process.
- **Description inflation:** Marketing language ("cutting-edge", "revolutionary", "AI-powered") without technical substance is flagged and does not contribute to a deep tech verdict.

---

## 3. Process Flow

Each company passes through four sequential steps:

```
Input row
    │
    ▼
[Agent 0 — Web Enrichment]
    • Searches the web for a factual company description
    • Confirms the result matches the correct Singapore company
    • Populates missing or thin descriptions before classification
    │
    ▼
[EPO Patent Lookup]
    • Queries the European Patent Office OPS API by company name
    • Retrieves up to 10 patents: CPC codes, titles, abstracts
    • DeepTechClassifier scores each patent's domain alignment
    • Result: patent count, CPC codes, EPO deep tech level, primary domain
    • Failures are non-fatal → zero patent count, run continues
    │
    ▼
[Agent 1 — Classifier]
    • Receives company data + EPO results as structured input
    • Applies 5-rule classification framework (see Section 2)
    • Performs a mandatory self-audit: states strongest counterargument,
      rebuts it, and adjusts confidence accordingly
    • Outputs: classification, confidence (0–100), per-criterion verdicts,
      CPC analysis, and classifier flags
    • Retries up to 2× on malformed JSON output
    │
    ▼
[Confidence Scoring]
    • Start from Agent 1's confidence (0–100)
    • Patent evidence: up to +15 if it agrees with the verdict,
                       up to −15 if it contradicts it
    • Cap at 60 if no description AND no patents
    │
    ▼
[Agent 2 — Validator]  ← triggered only if final_confidence < 70
    • Adversarial challenger: actively tries to disprove Agent 1's verdict
    • Runs 5 checks: steelman opposite, description inflation, CPC
      consistency, AI domain scrutiny, confidence calibration
    • Performs up to 3 live web searches for corroborating evidence
    • Verdicts: AUTO_APPROVE (confirm or override) or
                ESCALATE_FOR_HUMAN_REVIEW
    • Overrides accepted only if Agent 2 confidence ≥ 65
    • Agent 2's confidence replaces the score (it can lower it)
    │
    ▼
Output row → Excel workbook
```

---

## 4. Architecture Diagram

```
deep_tech_classifier/
├── classify.py                    # Entry point (CLI)
├── config.template.json           # Settings template — copy to config.json (not committed)
├── .env                           # API credentials (not in source control)
│
├── agents/
│   ├── enrichment_agent.py        # Agent 0 — web description fetch
│   ├── classifier_agent.py        # Agent 1 — LLM classification + self-audit
│   └── validator_agent.py         # Agent 2 — adversarial web validation
│
├── pipeline/
│   ├── settings.py                # Loads config.json + .env
│   ├── epo_bridge.py              # Adapter to EPO package → EPOResult
│   ├── confidence.py              # Confidence scoring + validator verdict resolution
│   ├── llm_provider.py            # Anthropic API wrapper (batch + sequential)
│   └── orchestrator.py            # Per-company loop + checkpointing
│
├── data/
│   ├── reader.py                  # Excel/CSV input
│   └── writer.py                  # Excel output (4 sheets)
│
├── lib/
│   └── epo_patent/                # Embedded EPO package (self-contained)
│       ├── core/api_client.py
│       ├── processors/company_processor.py
│       └── processors/deeptech_classifier.py
│
└── checkpoints/
    ├── run_state.json             # Current run ID (for resume)
    └── llm/llm_progress_*.csv    # Per-company progress (resume support)
```

> **EPO package note:** The pipeline uses the EPO package embedded at `./lib/epo_patent/`
> (configured via `config.json → epo.epo_package_dir`). It is fully self-contained and does
> not depend on any external folder.

---

## 5. Key Features

| Feature | Description |
|---------|-------------|
| **Batch processing** | Uses Anthropic Message Batches API for cost-efficient parallel classification of large lists |
| **Resume support** | Interrupted runs can be resumed with `--resume`; no work is lost |
| **Checkpointing** | Progress saved every 10 companies; incremental Excel output written at each checkpoint |
| **Confidence scoring** | Confidence in the chosen verdict: LLM confidence adjusted by patent evidence, revised by web validation |
| **Web enrichment** | Automatically fills missing company descriptions via live web search before classification |
| **Adversarial validation** | Low-confidence results are challenged by a second AI agent using live web searches |
| **Cost tracking** | Token counts and USD cost tracked per company and reported in output |
| **Management-ready output** | Colour-coded Excel with plain-English verdicts and action flags for non-technical reviewers |
| **Domain coherence check** | Detects and discards EPO results from the wrong company (name collision detection) |
| **Model tracking** | The model is chosen from a tier at startup, locked for the run, and named in every output file |

### The classifier model changes over time

AI providers retire models and release new ones, so the model behind a tier is not fixed. A verdict from this year's model may differ from next year's on borderline companies. The pipeline handles this in four ways:

- **Tested models only.** A tier resolves to a model from a short list that has been run through this pipeline, not to whatever the provider released most recently.
- **One model per run.** The model is chosen once at startup and reused on `--resume`. If the provider starts answering with a different model partway through, the run stops.
- **Every output names its model.** The Overview sheet shows the model requested and the one the provider reported; the Full Detail sheet records it per company.
- **A reference check.** Twenty companies with known verdicts are re-run whenever the model changes, and the pipeline warns at startup if the current model has not passed it.

For work that must be reproducible, pin an exact model in `config.json` (see the README).

---

## 6. Output Description

The pipeline produces a single Excel workbook (`{input_name}_classified_{timestamp}.xlsx`) with four sheets:

### Sheet 1 — Overview
A vertical metrics dashboard summarising the entire run:
- Total companies processed, deep tech count, general tech count
- Average confidence, cost breakdown, processing time
- Counts by validation decision (auto-approved, escalated, overridden)

### Sheet 2 — Management View
The primary sheet for decision-makers. One row per company, colour-coded:

| Column | Description |
|--------|-------------|
| Company Name | As provided in input |
| UEN | Unique Entity Number (if available) |
| Verdict | **Deep Tech** or **General Tech** (green / red) |
| Criteria 1: Innovation | Yes/No + one-line reasoning |
| Criteria 2: Scientific Foundation | Yes/No + one-line reasoning |
| Criteria 3: Proprietary IP | Yes/No + one-line reasoning |
| Confidence Score | 0–100 composite score |
| Confidence Tier | Near-Definitive / Strong / Moderate / Borderline / Weak / Minimal |
| Risk Flag | Escalated / Override / Confirmed |
| Action Required | Plain-English instruction for the reviewer |
| Key Reason | One-sentence summary of the decisive signal |
| Full Reasoning | Agent 1's full reasoning paragraph |
| Patents Found | Number of EPO patents found |

### Sheet 3 — Full Detail
All 37 output columns, including raw token counts, EPO CPC codes, validator check results, self-audit text, and cost per company. Intended for data analysts and audit trails.

### Sheet 4 — Legend
Explains all colour codes, confidence tiers, verdict labels, and column definitions for users unfamiliar with the pipeline.

---

## 7. Confidence Scoring

The confidence score always means the same thing: how likely the **chosen verdict** is to be correct (0–100).

**Before validation**

```
Confidence = Agent 1 confidence  ±  patent adjustment (0–15)
             └── capped at 60 if no description AND no patents
```

| Signal | Range | How it is calculated |
|--------|-------|----------------------|
| **LLM score** (`signal_score_llm`) | 0–100 | Agent 1's own confidence in its verdict |
| **Patent adjustment** (`signal_score_epo`) | −15 to +15 | Strength of the EPO deep tech signal × 15. Added when the verdict is deep tech, subtracted when it is general tech. Strength = level (Very Strong 1.0, Strong 0.8, Moderate 0.55, Not Deep-tech 0) × a patent-count factor that grows from 0.6 at one patent to 1.0 at five or more. No patents, or "Not Deep-tech" patents, give 0. |

If this score is below `validation.validator_threshold` (70), Agent 2 runs.

**After validation** (`signal_score_validator` records the change)

| Agent 2 outcome | Verdict | Confidence |
|-----------------|---------|------------|
| Confirms | unchanged | Agent 2's confidence (may be higher or lower) |
| Overrides with confidence ≥ 65 | Agent 2's verdict | Agent 2's confidence |
| Overrides with confidence < 65 (blocked, "Contested") | unchanged | at most 100 − Agent 2's confidence |
| Escalates / validation failed | unchanged | can only go down |

**Confidence tiers (for management readability):**

| Score | Tier | Meaning |
|-------|------|---------|
| 90–100 | Near-Definitive | Multiple aligned patents + clear technical description. No meaningful counterargument. |
| 75–89 | Strong | Clear signals in ≥2 of 3 criteria. Minor uncertainties do not change conclusion. |
| 60–74 | Moderate | One strong signal; others missing or ambiguous. Classification likely correct but not certain. |
| 45–59 | Borderline | Meaningful evidence on both sides. Human review recommended. |
| 30–44 | Weak | Sparse description, no patents. |
| 0–29 | Minimal | Near-absence of usable information. |

---

## 8. Configuration & Setup

### Required Credentials (`.env`)

```
ANTHROPIC_API_KEY=...     # Claude Haiku API access
EPO_KEY=...                      # EPO OPS API consumer key
EPO_SECRET=...                   # EPO OPS API consumer secret
```

### Key Settings (`config.json`)

| Setting | Default | Description |
|---------|---------|-------------|
| `llm.tier` | `fast` | `fast`, `balanced` or `best`; the pipeline picks the model for all three agents |
| `llm.model` | `null` | Set an exact model name to pin it instead of using the tier |
| `validation.validator_threshold` | `70` | Confidence below this triggers Agent 2 |
| `validation.max_web_searches` | `3` | Max web searches per Agent 2 call |
| `validation.override_min_confidence` | `65` | Agent 2 override accepted only at or above this |
| `confidence.epo_adjust_max` | `15` | Max points patents add to (or take from) confidence |
| `confidence.low_evidence_cap` | `60` | Confidence ceiling when there is no description and no patents |
| `enrichment.max_searches` | `2` | Max web searches per Agent 0 call |
| `pipeline.checkpoint_interval` | `10` | Save progress every N companies |
| `batch.enabled` | `true` | Use Anthropic Batch API (50% cost saving) |
| `epo.epo_package_dir` | `./lib/epo_patent` | Path to embedded EPO package |
| `epo.enabled` | `true` | Enable/disable EPO patent lookup |

---

## 9. Usage

```bash
# Initial setup
cd deep_tech_classifier
cp .env.template .env        # Fill in API keys

# Run classification
python classify.py --input companies.xlsx

# Resume an interrupted run
python classify.py --resume

# View help
python classify.py --help
```

---

## 10. Tech Stack

| Component | Technology |
|-----------|-----------|
| AI classification | Claude via Anthropic API by default (Haiku on the `fast` tier); Gemini and OpenAI also supported |
| Batch processing | Anthropic Message Batches API |
| Web search (Agents 0 & 2) | Anthropic web search tool (Claude tool use) |
| Patent data | EPO Open Patent Services (OPS) API |
| EPO patent analysis | Embedded EPO package (`lib/epo_patent/`) |
| Data I/O | pandas, openpyxl |
| Language | Python 3.10+ |
