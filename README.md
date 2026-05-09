# ai-image-labeling

> AI-powered image classification, timestamp overlay, and sequential organization — runs entirely from the terminal.

[![CI](https://github.com/YOUR_USERNAME/ai-image-labeling/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/ai-image-labeling/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/ai-image-labeling.svg)](https://www.npmjs.com/package/ai-image-labeling)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What it does

Given a folder of unorganized images (property inspections, e-commerce products, events…), `ai-image-labeling` will:

1. **Classify** each image using a configurable LLM provider (OpenAI, Anthropic, or Google) into configurable categories
2. **Apply temporal consensus** — images taken within 15 minutes of each other vote on ambiguous classifications
3. **Re-analyze unknowns** with a higher-detail second pass
4. **Stamp a red timestamp** (DD/MM/YYYY HH:MM) in the bottom-center of each photo
5. **Rename and export** as `NNN. Photo of category dated DD-MM-YYYY.jpeg`
6. **Cache results** to `analysis_results.json` so you can re-run without extra API costs

## Quick start

```bash
# Run without installing (npx)
npx ai-image-labeling --input ./my-photos --output ./sorted

# Or install globally
npm install -g ai-image-labeling
ai-image-labeling --input ./my-photos --output ./sorted
```

You need an API key for your chosen provider:

```bash
# OpenAI (default) — .env file or flag
echo "OPENAI_API_KEY=sk-..." > .env
ai-image-labeling --api-key sk-...

# Anthropic Claude
ai-image-labeling --provider anthropic --anthropic-api-key sk-ant-...

# Google Gemini
ai-image-labeling --provider google --google-api-key AIza...
```

## CLI reference

```
ai-image-labeling [OPTIONS]
ai-image-labeling reorder
ai-image-labeling single <number> <file>
```

<!-- flags-start -->

| Flag | Argument | Description | Default |
| ---- | -------- | ----------- | ------- |
| `-i, --input` | `<dir>` | Input directory with source images | `./input` |
| `-o, --output` | `<dir>` | Output directory for processed files | `./output` |
| `--provider` | `<name>` | LLM provider: openai | anthropic | google | `openai` |
| `--api-key` | `<key>` | OpenAI API key (overrides OPENAI_API_KEY env var) | — |
| `--anthropic-api-key` | `<key>` | Anthropic API key (overrides ANTHROPIC_API_KEY env var) | — |
| `--google-api-key` | `<key>` | Google AI API key (overrides GOOGLE_API_KEY env var) | — |
| `--model` | `<model>` | Model name (defaults: gpt-4o / claude-opus-4-7 / gemini-2.0-flash) | — |
| `--batch-size` | `<n>` | Images per API call | `20` |
| `--max-retries` | `<n>` | Max retries on API errors | `3` |
| `--concurrency` | `<n>` | Concurrent API batch calls in-flight | `3` |
| `--estimate` |  | Print cost estimate for all providers and exit | `false` |
| `--temporal-window` | `<minutes>` | Temporal cluster window in minutes | `15` |
| `--consensus-threshold` | `<n>` | Majority ratio for temporal override (0.5–1.0) | `0.6` |
| `--dedupe-threshold` | `<n>` | Hamming distance for burst dedup (0–64, 0=off) | `8` |
| `--dry-run` |  | Analyze without writing output files | `false` |
| `--skip-analysis` |  | Skip analysis, use cached analysis_results.json | `false` |
| `--force-skip-analysis` |  | Skip analysis using cached results even if categories.json changed | `false` |
| `--async` |  | Submit images to provider async batch API and exit (use --resume to collect) | `false` |
| `--resume` |  | Poll existing async batch job from analysis_job.json until complete | `false` |
| `--categories` | `<file>` | Path to custom categories.json | — |
| `--output-format` | `<fmt>` | Output format: pretty | json | none | csv | xlsx | sqlite | `pretty` |
| `--log-format` | `<fmt>` | Log format: pretty | json | `pretty` |
| `--timing` |  | Print per-step wall-time breakdown in run summary | `false` |
| `--filename-template` | `<pattern>` | Output filename template (tokens: {n}, {category}, {date}, {datetime}, {description}) | — |
| `-v, --verbose` |  | Show detailed debug logs | `false` |
| `-q, --quiet` |  | Suppress all non-error output | `false` |
| `--watch` |  | Watch input directory and process new images automatically | `false` |
| `--watch-poll` |  | Use polling for watch mode (required on NFS/SMB mounts) | `false` |
| `--link` |  | Run cross-image linking pass to identify related image pairs | `false` |
| `--link-window` | `<days>` | Time window in days for grouping images in the linking pass | `7` |
| `--self-critique` |  | Run a self-critique pass that flags suspicious classifications for reanalysis | `false` |
| `--learn` |  | Inject override patterns from previous runs into the batch prompt as few-shot examples | `false` |
| `--local-model` | `<model>` | Ollama model for tier-1 local pass in hybrid mode | `llava` |
| `--cloud-provider` | `<name>` | Cloud provider for tier-2 escalation in hybrid mode: openai | anthropic | google | `openai` |
| `--local-confidence-threshold` | `<n>` | Confidence threshold for hybrid escalation (0–1, default 0.70) | `0.70` |
| `--interactive` |  | Review and override LLM classifications before processing (requires TTY) | `false` |
| `--active-learn` |  | Write active_learning_queue.json listing images with confidence < 0.5 or unknown category | `false` |

<!-- flags-end -->

### Subcommands

| Command             | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `reorder`           | Re-number output after manually editing `analysis_results.json` |
| `single <n> <file>` | Process a single image with a custom sequence number            |

## Custom categories

`ai-image-labeling` works for **any image classification domain** — not just property inspections.

Copy one of the example configs and customize it:

```bash
cp examples/categories-ecommerce.json my-categories.json
ai-image-labeling --categories my-categories.json
```

Schema (`categories.json`):

```json
{
  "description": "My taxonomy",
  "categories": [{ "name": "front_view", "description": "Front-facing product shot" }],
  "pinnedLast": ["unknown"],
  "immune": [],
  "overridable": ["unknown"],
  "timezone": "Europe/London"
}
```

| Field         | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `categories`  | List of `{ name, description }` objects — fed directly to the GPT prompt |
| `pinnedLast`  | These categories appear at the end of the output, in order               |
| `immune`      | Never overridden by temporal consensus (e.g. receipts, screenshots)      |
| `overridable` | Can be overridden by a cluster majority vote (e.g. `unknown`)            |
| `timezone`    | IANA timezone for timestamps (default: `UTC`)                            |

## Cost estimate

With the default `gpt-4o` model and `detail: low`:

| Images | Est. cost |
| ------ | --------- |
| 50     | ~$0.01    |
| 200    | ~$0.03    |
| 1 000  | ~$0.13    |

Results are cached to `analysis_results.json` — subsequent runs with `--skip-analysis` are free.

## Development

```bash
git clone https://github.com/YOUR_USERNAME/ai-image-labeling
cd ai-image-labeling
npm install
cp .env.example .env  # add your OPENAI_API_KEY

npm run build         # compile TypeScript → dist/
npm test              # run tests
npm run test:coverage # with coverage report
npm run lint          # ESLint
npm run typecheck     # TypeScript compiler check
```

### Project structure

```
src/
  cli/          Commander.js entry point and help text
  analyzer/     LLM Vision batch analysis + temporal consensus
  processor/    Sharp image processing: overlay + JPEG export
  classifier/   Category grouping, sorting, and rules
  config/       Config loading (CLI flags → env → .env → defaults)
  plugin/       Plugin loader and lifecycle hook dispatcher (--plugin)
  reviewer/     Interactive review loop before processing (--interactive)
  reporter/     HTML, CSV, and XLSX report generation
  utils/        Logger, retry with backoff, progress bar

tests/          Vitest unit tests (LLMClient mocked)
scripts/        Utility scripts: fixture generation, benchmark runner, README generator
examples/       Starter category configs (property, e-commerce)
.github/
  workflows/    CI (lint + typecheck + test on Node 18 & 20), accuracy benchmark
  instructions/ Copilot coding instructions per module
  prompts/      Reusable Copilot prompt files
  agents/       Specialized Copilot agents
  skills/       Domain-specific skills for AI-assisted development
```

## Contributing

PRs are welcome! Please:

1. Run `npm run lint && npm run typecheck && npm test` before opening a PR
2. Add or update tests for new behavior
3. Keep new categories in a `categories-*.json` example file if they're widely reusable

## License

MIT © Erik Cunha
