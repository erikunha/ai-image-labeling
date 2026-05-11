# Roadmap — ai-image-labeling

> **Last updated:** May 2026  
> **Status key:** 🟢 Shipped · 🔵 Planned · ⏸ Deferred · ❌ Removed
>
> **v2.0 is feature-complete.** Horizons 1–8 are fully shipped. H9–H11 form the next strategic layer: semantic retrieval (H9), workflow intelligence (H11), and ML pipeline integration (H12). The north-star is evolving from "AI image labeling" into "semantic operational visual intelligence infrastructure."

---

## Strategic context

A domain-agnostic CLI tool for batch image classification. The category taxonomy is entirely user-defined via `categories.json` — the tool has no opinion about what you are classifying. Output is labelled, renamed JPEG files and a structured JSON manifest.

**Where v1.0 lands:** A reliable batch classifier with async execution, hybrid local/cloud routing, cross-image linking, structured output enforcement, and a published SDK. The schema is intentionally lean — `category`, `shortDescription`, `elements`, `confidence`, `extractedText`. No domain-specific fields.

---

## Architectural bets

### Bet 1 — Async-first execution model

Submit a job, come back in 30 minutes. OpenAI Batch API and Anthropic Message Batches both offer 50% cost reduction for this pattern. Sync remains the default for ≤50 image runs where live progress is useful.

### Bet 2 — Structured output enforcement

The LLM physically cannot return wrong-shaped JSON. OpenAI (`response_format.json_schema`, `strict: true`), Anthropic (tool use with schema), Google (Gemini `responseSchema`). The `safeParse()` warn-and-degrade path becomes dead code for all cloud providers.

Also unlocks **Anthropic prompt caching**: the system message (static categories + instructions) is separated from the user message (variable images). Cache hits are 90% cheaper and 10× faster.

### Bet 3 — Lean, domain-agnostic schema

The schema only captures what any image has: a category, a short description, the visible elements, a confidence score, and extracted text. No domain-specific fields. The user defines meaning through their `categories.json` taxonomy — the tool doesn't presuppose what they're looking at.

---

## Horizon 1 — Cost & Reliability

> **Goal:** Cut API cost by 50%+ on large runs. Eliminate the envelope-validation failure path.

| Item | Status |
|---|---|
| H1.1 Async batch execution (`--async` / `--resume`) | 🟢 |
| H1.2 Prompt caching (Anthropic) | 🟢 |
| H1.3 Structured output enforcement | 🟢 |
| H1.4 Update default models (`claude-opus-4-7`, etc.) | 🟢 |

---

### H1.1 — Async batch execution (`--async`) 🟢

`--async` submits a batch job to the provider's async API and exits. `--resume` polls until complete, then runs the normal classify → process → export pipeline. Writes `analysis_job.json` to track job state.

- OpenAI: `client.batches.create()` — 50% cost reduction
- Anthropic: `client.messages.batches.create()` — 50% cost reduction
- Google / Azure / Ollama: falls back to sync (no batch API equivalent)

---

### H1.2 — Prompt caching (Anthropic) 🟢

System message carries the static prompt (categories + instructions) with `cache_control: { type: 'ephemeral' }`. After the first batch in a run, every subsequent call hits the cache. On a 100-batch run, batches 2–100 pay cache-read rates (90% cheaper, 10× faster).

---

### H1.3 — Structured output enforcement 🟢

- **OpenAI / Azure:** `response_format: { type: 'json_schema', json_schema: { strict: true, schema: BATCH_ITEM_SCHEMA } }`
- **Anthropic:** tool use with `ANTHROPIC_BATCH_TOOL` schema; model must call the tool
- **Google Gemini:** `generationConfig.responseSchema`
- **Ollama:** `format: 'json'` + Zod validation fallback (no full schema enforcement)

---

### H1.4 — Update default models 🟢

`anthropic: 'claude-opus-4-7'` (from `claude-opus-4-5`). Verified via contract test suite.

---

## Horizon 2 — Data Richness & Output Formats

> **Goal:** Richer per-image data. Multiple output formats. Resumable runs.

| Item | Status |
|---|---|
| H2.1 Lean schema additions (`confidence`, `extractedText`) | 🟢 |
| H2.2 Schema migration layer | ❌ Removed — v1 is the first version, no migration needed |
| H2.3 Cross-image linking pass (`--link`) | 🟢 |
| H2.4 SQLite output format (`--output-format sqlite`) | 🟢 |
| H2.5 `--force-skip-analysis` flag | 🟢 |

---

### H2.1 — Lean schema additions 🟢

Two fields added to `AnalysisResult` and `ProcessedResult`:

```typescript
confidence: number;        // 0.0–1.0 self-reported model confidence
extractedText: string | null; // OCR for document/screenshot images; null if no text
```

`confidence` gates hybrid routing (H3.1) and self-critique (H3.2). `extractedText` is the only domain-specific-looking field — it applies universally to any image that might contain text.

Domain-specific fields (`defects`, `severity`, `condition`, `locationWithinCategory`) were considered and explicitly rejected. The tool stays agnostic.

---

### H2.2 — Schema migration layer ❌ Removed

Originally planned to migrate v1→v4 caches. Removed: `CACHE_SCHEMA_VERSION = 1` is the first and only version. When a breaking schema change is needed in the future, add a migration step then.

---

### H2.3 — Cross-image linking pass (`--link`) 🟢

Optional pass after classification. Groups images by category + time window (default: 7 days), sends compact summaries to the LLM, and asks it to identify related pairs. Returns `relatedImages: Array<{ number, relation }>` on each `ProcessedResult`. HTML report renders related-image links inline.

Relations: `same_location`, `same_defect`, `progression`.

---

### H2.4 — SQLite output format 🟢

`--output-format sqlite` writes `analysis_results.db`. Uses `better-sqlite3`.

```sql
CREATE TABLE runs    (id, processed_date, schema_version, total_images, categories_hash);
CREATE TABLE images  (run_id, number, original_file, output_file, category,
                      timestamp_ms, short_description, confidence, extracted_text);
CREATE TABLE elements    (run_id, image_number, element);
CREATE TABLE image_links (run_id, image_a, image_b, relation);
```

---

### H2.5 — `--force-skip-analysis` flag 🟢

Suppresses the categories-hash mismatch warning when using `--skip-analysis`. Intended for CI pipelines where the categories change is intentional.

---

## Horizon 3 — Platform & Ecosystem

> **Goal:** Other tools can build on this. The library API is first-class.

| Item | Status |
|---|---|
| H3.1 Hybrid local/cloud routing (`--provider hybrid`) | 🟢 |
| H3.2 Self-critique agentic loop (`--self-critique`) | 🟢 |
| H3.3 Feedback loop from overrides (`--learn`) | 🟢 |
| H3.4 Published SDK API (`src/sdk.ts`) | 🟢 |
| H3.5 `docs/plugins.md` | 🟢 |
| H3.6 Worker thread pool + streaming pipeline | ⏸ Deferred |

---

### H3.1 — Hybrid local/cloud routing 🟢

Two-tier strategy: Ollama (tier 1, free) → cloud provider (tier 2, only for images below `--local-confidence-threshold`, default 0.70). If Ollama is confident on 80% of a run, cloud costs drop 80%.

---

### H3.2 — Self-critique agentic loop 🟢

Optional fourth pass (`--self-critique`). Sends the full classified sequence summary (text only) to the LLM. It flags images that are inconsistent with their neighbors or have low confidence. Flagged images get a targeted reanalysis at `detail: 'high'`.

---

### H3.3 — Feedback loop from interactive overrides 🟢

`--learn` reads the `overrides[]` array written by `--interactive` review, finds recurring correction patterns (≥3 occurrences), and injects few-shot clarification notes into the next run's batch prompt.

---

### H3.4 — Published SDK API 🟢

`src/sdk.ts` re-exports a stable subset of the internal API. `package.json` exports map:
- `"."` → `dist/sdk.js` (library)
- `"./cli"` → `dist/cli/index.js` (CLI entry)

Internal module paths are not semver-stable. Only the SDK entry point is.

---

### H3.5 — `docs/plugins.md` 🔵

| | |
|---|---|
| **Effort** | XS |

The plugin system (`PLUGIN_API_VERSION`, `onImageAnalysed`, `onImageProcessed`, `onRunComplete`) is fully implemented. Document the plugin interface, a working example, and the versioning contract.

---

### H3.6 — Worker thread pool + streaming pipeline ⏸

| | |
|---|---|
| **Effort** | L + S |
| **Unlock condition** | Profile with `clinic.js` on 200+ image runs first |

If profiling shows the Sharp overlay pass is measurably blocking the event loop, implement a `piscina` worker pool. Do both the pool and the streaming pipeline together to avoid two rewrites of `src/processor/`.

---

---

## Horizon 4 — Foundation Hardening (v1.1)

> **Goal:** Close every quality gap before any new surface area. Make the CLI bulletproof at Principal/Staff level. APIs and server-mode features are explicitly deferred until this horizon is done.

| Item | Description | Status |
|---|---|---|
| H4.1 `docs/plugins.md` | Document the plugin hook API, versioning contract, and three working examples. | 🟢 |
| H4.2 Scripts typecheck in CI | `scripts/tsconfig.json` was missing `rootDir` — fixed. `pnpm exec tsc -p scripts/tsconfig.json --noEmit` added to CI. Catches type errors in `benchmark.ts` that were silently passing. | 🟢 |
| H4.3 Atomic partial-cache write | `flushPartialCache` now uses tmp+rename, matching the final-cache write. A crash mid-checkpoint no longer produces a corrupted `.analysis_cache_partial.json`. | 🟢 |
| H4.4 Fix benchmark stale model + type errors | `benchmark.ts` used `claude-opus-4-5` (stale); `DEFAULT_MODELS` was missing `'hybrid'`; `buildConfig()` was missing 10 required `Config` fields. All fixed. | 🟢 |
| H4.5 Contributor docs: npm → pnpm | `CONTRIBUTING.md` and `pr-description.yml` told contributors to use `npm`. Fixed to `pnpm` throughout, including scripts typecheck step in PR checklist. | 🟢 |
| H4.6 Remove dead CI code | `mutation.yml` had a PR-comment step guarded by `if: github.event_name == 'pull_request'` — a condition that could never be true since the workflow has no `pull_request` trigger. Removed. | 🟢 |
| H4.7 Mutation testing gate on PRs | `mutation.yml` now triggers on `pull_request` with a `paths` filter (`src/classifier/**`, `src/analyzer/temporal.ts`). Mutation only runs when the pure-logic modules actually change — keeps PR feedback fast. Posts score + threshold status as a PR comment. Weekly schedule remains for full sweeps. | 🟢 |
| H4.8 Category taxonomy library | 5 new pre-built `categories.json` files in `examples/`: legal documents, receipts/invoices, construction site, vehicle inspection, food & beverage. All validated against `CategoryConfigSchema`. | 🟢 |
| H4.9 Release workflow | `.github/workflows/release.yml`: semver tag push → lint + typecheck (src + scripts) + test + build → smoke-test `dist/sdk.js` → `pnpm publish` with npm provenance → GitHub Release with auto-generated changelog. Requires `NPM_TOKEN` secret. | 🟢 |

---

## Horizon 5 — Performance & Provider Breadth (v1.2)

> **Goal:** Handle 500+ image runs without memory pressure. Close the async gap for Azure and Google.

| Item | Description | Status |
|---|---|---|
| H5.1 Worker thread pool (H3.6 carry) | Profile first with `clinic.js`. If Sharp overlay is blocking, implement `piscina` pool in `src/processor/`. Do pool + streaming together — two rewrites is waste. | ⏸ |
| H5.2 Azure Batch API | `createAzureAsyncBatchClient` added to `client.ts`. Uses `AzureOpenAI` with `apiVersion: '2024-07-01'` (minimum for Batch API). `AsyncJobState.provider` extended to include `'azure'`. Parity: OpenAI, Anthropic, Azure all support `--async`. | 🟢 |
| H5.3 Google Batch API | The `@google/generative-ai` SDK has no batch endpoint. Google batch prediction requires Vertex AI (`@google-cloud/aiplatform`) — a different package, service-account auth, different API surface. Deferred until there is demand; the cost is a new major dependency. | ⏸ |
| H5.4 Memory ceiling for large runs | Profiled: `AnalyzedImage[]` for 2000 images is ~600KB of text — not a concern. Real memory pressure is Sharp buffers, already bounded by `concurrency × batchSize`. Deferred pending evidence of actual OOM failures on real hardware. | ⏸ |

---

## Horizon 6 — Intelligence & Accuracy (v1.3)

> **Goal:** The tool gets smarter over time and requires less human correction.

| Item | Description | Status |
|---|---|---|
| H6.1 Category suggestion mode | `suggest-categories` subcommand samples N images, asks the LLM to propose a taxonomy, writes a draft `categories.json`. Eliminates the blank-page problem for new users. SDK exports `suggestCategories()`. | 🟢 |
| H6.2 Multi-model consensus voting | Run the same batch through 2 providers; take majority vote per image. Accuracy improvement for high-stakes runs. Requires dual-provider Config shape — deferred to dedicated session. | ⏸ |
| H6.3 Active learning queue | `--active-learn` writes `active_learning_queue.json` listing images with `confidence < 0.5` or `category === 'unknown'` after each run. Enables targeted human review without reviewing everything. | 🟢 |
| H6.4 Confidence calibration report | HTML report now includes a calibration table when `overrides[]` exist: per-category correction rate, avg confidence, avg corrected confidence. Color-coded correction rate (red ≥20%, amber ≥10%). | 🟢 |

---

## Horizon 7 — Architecture Quality Gate (v1.4)

> **Goal:** Close every structural gap identified in the principal/staff audit before adding any new surface area. H8 (Enterprise Integration) is gated on this horizon being complete. Three layers of work: bug fixes, behavior gaps, and architectural alignment with Hexagonal/Ports & Adapters.
>
> **Status: 🟢 Complete.** All 11 items shipped. The gate for H8 is now open.

### Bug fixes (P0 — ship-blocking)

| Item | Description | Status |
|---|---|---|
| H7.1 Fix stale model in `--estimate` | `src/utils/cost.ts:36` showed `claude-opus-4-5`; corrected to `claude-opus-4-7`. | 🟢 |
| H7.2 Fix unguarded `choices[0]` crash | Added optional chaining `response.choices[0]?.message.content ?? '{}'` on OpenAI, Azure, and Ollama clients. Run no longer throws `TypeError` on content-filter responses. | 🟢 |
| H7.3 Atomic write in `runReorder` | `runReorder` now uses tmp+rename for the cache write, matching every other cache write in the file. | 🟢 |

### Behavior gaps (P1 — user-visible inconsistencies)

| Item | Description | Status |
|---|---|---|
| H7.4 `--resume` pipeline parity | Extracted `postAnalysisPipeline()` shared by both the normal and resume paths. `--resume` now runs `--link-images`, active-learn queue, `onRunComplete` hooks, and partial-cache cleanup — identical to a normal run. | 🟢 |
| H7.5 Fix `onImageProcessed` hook ordering | `onImageProcessed` moved inside `postAnalysisPipeline`, after the linking pass. Plugins on `--link` runs now see `relatedImages` populated correctly. | 🟢 |

### Architecture — Hexagonal / Ports & Adapters (P2 — structural)

> The audit found that `LLMClient`, `AsyncBatchClient`, and `Plugin` are correctly implemented as ports. The following items close the remaining gaps: reporters, filesystem I/O, and `Config` coupling.

| Item | Description | Status |
|---|---|---|
| H7.6 Reporter port | `Reporter` interface in `src/reporter/port.ts`. Adapters: `csv.ts`, `xlsx.ts`, `sqlite.ts`, `html.ts`. `buildReporters(config)` factory in `src/reporter/factory.ts`. `postAnalysisPipeline` loops over `Reporter[]` — the `if/else` format chain is gone. New formats never touch the orchestrator. | 🟢 |
| H7.7 Narrow `Config` at domain boundaries | `applyTemporalConsensus` accepts `TemporalConsensusOpts`, `classifyAndSort` accepts `ClassifyOpts`, `getSortedCategories` accepts `CategoryOpts`. All call sites pass full `Config` unchanged (structural typing). Domain functions no longer depend on the 90-field infrastructure type. | 🟢 |
| H7.8 `FileRepository` port | `src/fs/port.ts` defines the interface. `NodeFileRepository` wraps `fs-extra` (production). `MemoryFileRepository` provides an in-memory adapter for tests. `runBatch` accepts optional `fileRepo` parameter defaulting to `NodeFileRepository`. All filesystem calls in `runBatch`/`postAnalysisPipeline` route through the port. `FileRepository`, `NodeFileRepository`, `MemoryFileRepository` exported from `src/sdk.ts`. | 🟢 |
| H7.9 Stop in-place mutation / full readonly | `temporal.ts`, `critique.ts`, `batch.ts`, `async-batch.ts`, `router.ts` all return new objects instead of mutating. `reorder.ts` returns `ProcessedResult[]`. All fields on `AnalysisResult`, `ProcessedResult`, `AnalysisCache` are now `readonly`. Tests updated to use return values. | 🟢 |

### Quality (P3 — minor consistency)

| Item | Description | Status |
|---|---|---|
| H7.10 Atomic writes for active-learn and suggest | Active-learn queue and `suggest-categories` output now use tmp+rename. All file writes in the project are now atomic. | 🟢 |
| H7.11 Split `client.ts` per provider | `src/analyzer/providers/{openai,anthropic,google,azure,ollama,schemas}.ts` — each ≤150 lines. `client.ts` is now a ~115-line thin routing layer holding only interfaces and factory functions. H8 can add Bedrock/Vertex as new files without touching existing ones. | 🟢 |

---

## Horizon 8 — Enterprise Integration (v2.0 — deferred)

> **Goal:** Fit into pipelines beyond the local CLI.
>
> **Status: 🟢 Complete.** All 5 items shipped.

| Item | Description | Status |
|---|---|---|
| H8.2 Cloud storage output targets | `--output-bucket s3://...` / `gs://...` / `azure-blob://...`. `FileRepository` adapters in `src/fs/{s3,gcs,azure-blob}-adapter.ts`. `createFileRepository` factory routes by URI prefix. | 🟢 |
| H8.3 Webhook on run complete | `--webhook <url>`: POST `analysis_results.json` when a run finishes. `src/utils/webhook.ts` — failure-tolerant, never aborts the run. | 🟢 |
| H8.4 Bedrock / Vertex AI providers | AWS Bedrock (Claude via IAM) in `src/analyzer/providers/bedrock.ts`. Google Vertex AI (ADC) in `src/analyzer/providers/vertex.ts`. Priced in `src/utils/cost.ts`. | 🟢 |
| H8.5 TypeDoc SDK reference | Auto-generate API docs from `src/sdk.ts`, publish to GitHub Pages via `.github/workflows/docs.yml`. `pnpm run docs:generate`. | 🟢 |

---

---

## Horizon 9 — Semantic Retrieval (v2.1)

> **Goal:** Unlock natural-language search across classified collections. This is the primary moat identified in the product brief: workflow-aware semantic visual organization. Without search, the platform is a filing system. With search, it becomes retrieval infrastructure.

| Item | Description | Status |
|---|---|---|
| H9.1 Text-embedding generation | After classification, embed each image's `shortDescription + elements + category` using the provider's embedding API (OpenAI `text-embedding-3-small`, Google `text-embedding-004`, Azure equivalent). Stored in `analysis_embeddings.index.json`. Gated behind `--embed` flag — opt-in, adds one API call per image. | 🟢 |
| H9.2 Lightweight vector index | `src/search/index.ts` builds and persists a cosine-similarity index from stored embeddings. Pure TypeScript — no new runtime dependency. Stored as `analysis_embeddings.index.json` (flat array of `{ number, file, vector }`) alongside the cache. Rebuilt after each `--embed` run. | 🟢 |
| H9.3 `search` subcommand | `ai-image-labeling search --query "kitchen with natural lighting" --top 10` — embeds the query text, ranks results by cosine similarity, prints a table with rank / file / category / score / description. `--output-format json` emits machine-readable ranked results. `--min-score <0–1>` filters low-confidence matches. | 🟢 |
| H9.4 Keyword fallback search | `ai-image-labeling search --keyword "crack"` — full-text scan over `shortDescription`, `elements`, and `extractedText` fields in `analysis_results.json`. No embedding required. Works on any existing cache without `--embed`. Ranked by field-match count. | 🟢 |

---

### H9.1 — Embedding generation detail

Embedding providers used per `--provider`:

| Provider | Embedding model | Dimensions | Cost |
|---|---|---|---|
| openai / azure | `text-embedding-3-small` | 1536 | $0.00002/1K tokens |
| google / vertex | `text-embedding-004` | 768 | ~free tier |
| anthropic / bedrock | falls back to OpenAI if `OPENAI_API_KEY` set; else errors with actionable message | — | — |
| ollama | `nomic-embed-text` via `/api/embeddings` | 768 | free (local) |

Embeddings are stored separately from the main analysis cache — the `analysis_results.json` schema does not change. The `--embed` flag is required; never generated silently.

---

### H9.2 — Vector index detail

Index format (`analysis_results.index.json`):
```json
{
  "schemaVersion": 1,
  "embeddingModel": "text-embedding-3-small",
  "dimensions": 1536,
  "generatedAt": "2026-05-09T...",
  "entries": [
    { "number": 1, "file": "original.jpg", "vector": [0.1, -0.2, ...] }
  ]
}
```

Atomic write (tmp+rename). Rebuilt when `analysis_results.json` is newer than the index. `src/search/` module — no LLM SDK imports, no Sharp.

---

## Horizon 11 — Workflow Intelligence (v2.3)

> **Goal:** Move from labeling individual images to reasoning about image *sequences*. Progression detection, session clustering, multi-run comparison, and multi-model consensus address the core use cases in construction, legal, and medical auditing. This is where temporal reasoning matures from a noise-reducer into a first-class product feature.

| Item | Description | Status |
|---|---|---|
| H11.1 Progression detection | Aborted — domain-specific assumptions (crack, mold, worsening, etc.) violate the domain-agnostic principle. The tool provides labeling infrastructure; users configure domain semantics via `categories.json`. | ❌ |
| H11.2 Session reconstruction | `--session-gap <minutes>`: cluster images into sessions by timestamp gap. `Session` type written to `AnalysisCache.sessions[]`; each `ProcessedResult` gets `sessionId`. Pure `buildSessions()` in `src/analyzer/sessions.ts`. | ✅ |
| H11.3 Multi-model consensus (H6.2 carry) | `--consensus-providers openai,anthropic`: run both providers in parallel, pick higher-confidence result on disagreement, flag with `lowConsensus: true`. Pure `runConsensus()` in `src/analyzer/consensus.ts`. | ✅ |
| H11.4 `diff` subcommand | `ai-image-labeling diff <before> <after>`: compare two `analysis_results.json` files; reports added/removed/category-changed/confidence-changed. JSON output with `--output-format json`. Pure `diffCaches()` in `src/diff/index.ts`. | ✅ |

---

## Horizon 12 — ML Pipeline Integration (v2.4)

> **Goal:** Make classified datasets directly usable by ML training pipelines and annotation tools. COCO and YOLO exports here mean **image classification** datasets (whole-image class labels), not object detection (no bounding boxes). This is a real and useful export for training image classifiers (ViT, ResNet, EfficientNet). Users who need per-object bounding boxes will need to add them via a human annotation tool (Label Studio). The roadmap does not overpromise object detection capability.

| Item | Description | Status |
|---|---|---|
| H12.1 COCO JSON export | `--output-format coco`: generates `annotations.json` in COCO image-classification format. Categories map to COCO `categories[]`. `fullDescription` populates `captions`. Suitable for training image classifiers. Not object-detection format — no per-object bounding boxes. | 🔵 |
| H12.2 YOLO label export | `--output-format yolo`: generates per-image `.txt` label files and `classes.txt`. Compatible with Ultralytics YOLOv8 `classify` training mode. Whole-image bounding boxes (0 0 1 1 normalized) are valid for classification but not detection. | 🔵 |
| H12.3 Label Studio XML export | `--output-format label-studio`: generates Label Studio import XML with pre-filled classification annotations. Human annotators review and correct LLM labels, then export back for `--learn` injection. Closes the active-learning loop. | 🔵 |
| H12.4 Dataset versioning manifest | `analysis_history.json` — append-only log of every completed run: timestamp, categoriesHash, imageCount, model, provider, unknownRate, avgConfidence. Written alongside `analysis_results.json`. Enables drift detection across runs. SDK exports `readRunHistory()`. | 🔵 |
| H12.5 Category filter flags | `--include-categories kitchen,bathroom` / `--exclude-categories unknown` — skip analysis or output for images outside the filter. Useful for partial re-runs, cost reduction on targeted categories, and building category-specific training sets. | 🔵 |

---

## Horizon 13 — Search Infrastructure Upgrade (v2.5)

> **Goal:** Replace the naive string scan and JSON flat-file vector index with a proper search engine.
> The current architecture hits hard walls at a few thousand images: O(n) keyword scan, full-index load per query (117 MB at 10K images with OpenAI embeddings), no BM25 scoring, no stemming, no hybrid ranking.
> H13 does not add a new runtime dependency — it uses the existing `better-sqlite3` dep and FTS5 (SQLite built-in).

| Item | Description | Status |
|---|---|---|
| H13.1 Embedding model + dimension tracking (P0 bug) | `IndexFile` stores no `embeddingModel` or `dimensions`. Switching providers (OpenAI 1536-dim → Google 768-dim) silently produces a mixed-dim index; cosine returns 0 for all entries with no error. Fix: add `embeddingModel` and `dimensions` fields; validate on load; bump `INDEX_SCHEMA_VERSION` to 2. | 🔵 |
| H13.2 SQLite FTS5 search index | Replace keyword string-scan with SQLite FTS5 (BM25 scoring, stemming, prefix matching). New `analysis_search.db`. FTS5 virtual table indexes `shortDescription`, `fullDescription`, `elements`, `extractedText`, `category`. `--rebuild-index` flag. Zero new dep — `better-sqlite3` already ships. | 🔵 |
| H13.3 Float32 vector quantization + BLOB storage | Store vectors as `Float32Array` BLOB in SQLite instead of JSON float64 text. 117 MB → ~59 MB at 10K OpenAI images. ~0.01% cosine recall loss. 2–3x faster scan from binary vs JSON parse. Auto-migrates old JSON index on first `--rebuild-index`. | 🔵 |
| H13.4 Hybrid search + Reciprocal Rank Fusion | Merge BM25 and cosine scores with RRF: `score = 1/(k+rank_keyword) + 1/(k+rank_semantic)`. Single `search` subcommand — no more `--keyword` vs `--semantic` mode choice. Each mode fetches top-2K candidates; RRF re-ranks. Consistently outperforms either mode alone. | 🔵 |
| H13.5 Metadata filter flags | `--filter-category <name>`, `--filter-min-confidence <0-1>`, `--filter-session <id>`, `--filter-after <date>`. Applied as SQL WHERE before ranking — filter before score, not after (otherwise topK semantics break). | 🔵 |
| H13.6 Staleness detection | After every analysis run, compare cache image count against index. If stale: `[warn] Search index is out of date (87 new images). Run: ai-image-labeling search --rebuild-index`. On `--watch`, queue incremental update after each batch. | 🔵 |

---

### H13.1 — Embedding model + dimension tracking (P0)

**Root cause:** `IndexFile` in `src/search/index.ts` has `schemaVersion`, `generatedAt`, `entries[]` — no `embeddingModel`, no `dimensions`.

**Failure mode:** User runs `--embed --provider openai` (1536 dims). Switches to `--provider google` and re-runs `--embed` (768 dims). New query vector is 768-dim. The `a.length !== b.length -> return 0` guard in `cosineSimilarity` silently returns zero similarity for all old entries. Search returns empty. No warning.

**Fix schema:**
```typescript
interface IndexFile {
  schemaVersion: 2;
  embeddingModel: string;   // "text-embedding-3-small"
  dimensions: number;       // 1536
  generatedAt: string;
  entries: EmbeddingEntry[];
}
```
On load: if `dimensions !== queryVector.length` throw actionable error: "Index was built with text-embedding-3-small (1536 dims) but query vector is 768 dims. Run --embed to rebuild."

---

### H13.2 — SQLite FTS5 search index

SQLite FTS5 is a full-text search engine built into every SQLite binary. Zero new dependency. `better-sqlite3` exposes it already.

**Schema:**
```sql
CREATE TABLE images_meta (
  number INTEGER PRIMARY KEY, category TEXT, confidence REAL,
  original_file TEXT, output_file TEXT, timestamp_ms INTEGER, session_id TEXT,
  vector BLOB  -- Float32Array, NULL if not embedded
);

CREATE VIRTUAL TABLE images_fts USING fts5(
  number UNINDEXED, category, short_description, full_description,
  elements, extracted_text,
  content='images_meta', content_rowid='number',
  tokenize='unicode61 remove_diacritics 1'
);
```

**Keyword query:** `SELECT number, rank FROM images_fts WHERE images_fts MATCH ? ORDER BY rank`

**Why this beats `.includes()`:**
- "crack" matches "cracked", "cracking", "micro-crack" (stemming + prefix)
- BM25 weights rare terms — "asbestos" outranks "wall" even if both match
- Multi-term: "water damage tiles" ranks all-three-term images first
- ~100x faster at 10K+ images (inverted index vs full-scan)

---

### H13.4 — Hybrid search + Reciprocal Rank Fusion

Semantic search misses exact text matches. Keyword search misses synonyms. RRF merges both lists without needing to normalize scores to the same scale — the only input is rank position.

```typescript
function reciprocalRankFusion(
  keyword: RankedResult[], semantic: RankedResult[], k = 60
): RankedResult[] {
  const scores = new Map<number, number>();
  keyword.forEach(({ number }, rank) =>
    scores.set(number, (scores.get(number) ?? 0) + 1 / (k + rank + 1)));
  semantic.forEach(({ number }, rank) =>
    scores.set(number, (scores.get(number) ?? 0) + 1 / (k + rank + 1)));
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([number, score]) => ({ number, score, file: '' }));
}
```
k=60 is the standard empirically validated constant from the original RRF paper (Cormack et al. 2009).

---

## Horizon 14 — Embedding Quality and Retrieval Intelligence (v2.6)

> **Goal:** Raise the quality ceiling beyond what LLM-description text can deliver.
> The hard limit of H9: retrieval quality is bounded by description quality. CLIP bypasses this.
> Query expansion and re-ranking are incremental wins within the current embedding approach.

| Item | Description | Status |
|---|---|---|
| H14.1 Query expansion via LLM | Before embedding a search query, call the LLM to expand it: "crack" -> ["crack", "fracture", "fissure", "hairline crack", "spall"]. Embed the expanded terms and average the vectors (centroid). Dramatically improves recall for domain vocabulary mismatches. `--expand-query` flag. Single cheap LLM call (~$0.001). | 🔵 |
| H14.2 Multi-modal image embeddings (CLIP) | Embed actual image pixels instead of LLM description text. Provider: Ollama `nomic-embed-vision` (free, local). Enables "find images visually similar to this reference photo" queries. Bypasses the description-quality ceiling entirely. `--embed-mode vision` flag. Separate `analysis_vision.index.db` to coexist with text embeddings. | 🔵 |
| H14.3 Parallel embedding calls | `generateEmbeddings` is currently sequential. Parallelize with `p-limit(5)` — 5x throughput. At 1K images: ~1000s -> ~200s. `p-limit` is already a production dep. | 🔵 |
| H14.4 Incremental index updates | On `--watch` or partial re-runs, compute the delta (new/removed image numbers) and INSERT/DELETE only changed rows. Do not rebuild the full FTS5 index. Enables live search on continuously growing collections. Requires H13.2. | 🔵 |
| H14.5 Re-ranking pass (cross-encoder) | After hybrid retrieval returns top-20 candidates, run a cross-encoder (Ollama `bge-reranker-v2-m3`) to score each (query, fullDescription) pair jointly. Cross-encoders see both texts simultaneously — much better precision than bi-encoder cosine. `--rerank` flag. ~200ms for 20 candidates on local Ollama. | 🔵 |

---

### H14.1 — Query expansion detail

Query expansion works best when user vocabulary doesn't match LLM vocabulary. A lawyer searching "water ingress" should match images described as "moisture penetration", "damp patches", "efflorescence." The LLM picked one term per image; the user picks another.

**LLM prompt:** `List 6-8 synonyms or related visual terms for: "{query}". Return a JSON array of strings only.`
**Result:** embed each synonym, compute centroid vector, use centroid as query vector.
**Cost:** one LLM call per search query. With Anthropic: ~$0.002. With Ollama: free.
**Offline mode:** user-supplied `synonyms.json` file for deterministic air-gapped expansion.

---

### H14.2 — CLIP / multi-modal embeddings — the real moat

Text-of-text embeddings have a hard ceiling: you are searching descriptions, not images. Two identical images described differently rank far apart; two different images described identically rank together.

**CLIP jointly embeds images and text in the same vector space.** Embed a photo -> vector. Embed "red couch" -> vector. Cosine similarity between them is meaningful.

**Local path (zero API cost):** Ollama `nomic-embed-vision`. POST the Sharp-resized JPEG bytes to `/api/embed`. Same `embedWithOllama` infrastructure, new model name.

**Why this is the long-term moat:**
- Users can query by uploading a reference image ("find images that look like this")
- Seasonal/condition changes are visible in pixels even when LLM described both as "wall"
- Works on images the LLM got wrong
- No description quality dependency

---

## Horizon 15 — Collection Scale (v2.7)

> **Goal:** Handle collections that exceed what in-process flat arrays can serve.
> Everything below is gated on user evidence. Trigger: any collection above 50K images on a single node.
> Do not build ahead of demand.

| Item | Description | Status |
|---|---|---|
| H15.1 ANN index (HNSW) | At >50K images, brute-force cosine is ~500ms per query. Switch to HNSW via `hnswlib-node` (native binding, prebuilt binaries). O(log n) queries — ~5ms at 1M vectors. Auto-activated when `entries.length > 50_000`. Falls back to flat scan below threshold. | 🔵 |
| H15.2 Worker thread pool (H3.6/H5.1 final carry) | Profile with `clinic.js flamegraph` on 500-image run. If Sharp overlay pass appears in top 3 hotspots, implement `piscina` pool. Do pool + streaming pipeline together — two rewrites is waste. Unlock condition: profiling evidence, not speculation. | ⏸ |
| H15.3 Cache sharding for large collections | `analysis_results.json` is a flat array. At 100K images it is ~150 MB. Shard by session or date bucket. Main cache becomes a shard index. Unlock condition: a user reporting >50K images in a single collection. | 🔵 |

---

### H15.1 — HNSW detail

HNSW (Malkov and Yashunin, 2018) is the dominant ANN algorithm in production vector stores (Pinecone, Weaviate, Qdrant, Milvus all use it). It builds a multi-layer proximity graph where each node links to its M nearest neighbors. Query traversal starts at the top layer and greedily descends.

**`hnswlib-node` in practice:**
- Native Node.js binding, prebuilt binaries on npm (same pattern as `better-sqlite3`)
- `HierarchicalNSW` with `'cosine'` space, 1536 or 768 dimensions
- Build: O(n log n), one-time
- Query: O(log n), ~5ms at 1M vectors
- Persists to binary file on disk
- Incremental insert/delete supported

**Threshold:** HNSW only activates when `entries.length > 50_000`. Below that, flat JavaScript cosine is under 50ms. The threshold is configurable: `--vector-index-threshold 50000`.

---

## Horizon 16 — Engineering Integrity (v2.8)

> **Goal:** Close the architectural and correctness gaps identified in the May 2026 Principal/Staff Engineer audit. No new user-visible features — only correctness, robustness, and architecture completion.

| Item | Description | Status |
|---|---|---|
| H16.1 `PartialAnalysisCache` readonly fields | All fields on `PartialAnalysisCache` are currently mutable. Accidental mutation mid-run produces silent corrupted crash-recovery checkpoints. Add `readonly` to all fields to match `AnalysisCache`. | 🔵 |
| H16.2 `withRetry` semantics fix | `RetryOptions.maxRetries` actually controls total attempt count, not retry count. `maxRetries: 3` = 3 total attempts (2 retries). Rename to `maxAttempts` across `src/utils/retry.ts` and all call sites for accurate semantics. | 🔵 |
| H16.3 `better-sqlite3` dependency classification | `better-sqlite3` is in `devDependencies` but is a runtime optional dep used by `src/reporter/sqlite.ts`. Moving to `optionalDependencies` ensures `pnpm install --prod` installs it when requested. | 🔵 |
| H16.4 FileRepository completion | `src/index.ts` imports `fs-extra` directly, bypassing the `FileRepository` port. Route `runBatch`, `runReorder`, `runSingle`, `runWatch` through `FileRepository`. Unlocks the S3/GCS/Azure adapters for the primary run path. | ✅ |
| H16.5 Embedding index schema versioning | Companion to H13.1 P0 bug: add `embeddingModel: string` and `dimensions: number` to `IndexFile` metadata. On load, validate against current provider — mismatch rejects the index and prompts re-embed. Bump `INDEX_SCHEMA_VERSION` to 2. | 🔵 |
| H16.6 Documentation: `src/fs/` and `sdk.ts` | Neither `src/fs/` (FileRepository port + 5 adapters) nor `src/sdk.ts` (stable public API surface) appear in CLAUDE.md or AGENTS.md boundary tables. Add both. Document which exports are semver-stable vs internal. | 🔵 |

---

## What we are not building

| Item | Reason |
|---|---|
| GUI / web interface | Not the audience. CLI + HTML report covers it. |
| HTTP server / REST API | Removed in H16 cycle. A CLI tool that runs as a batch process has no need for a persistent HTTP server. |
| Multi-user / SaaS | Different product. |
| Video / audio analysis | Out of scope. Separate tool. |
| Domain-specific output fields | The category taxonomy in `categories.json` is the extension point. |
| Real-time streaming response | The batch model with progress bar is the right UX for this workload. |

---

## Metrics that matter

| Area | Metric | Target |
|---|---|---|
| Cost | API cost per image (async mode) | ≤ $0.001 |
| Reliability | Envelope validation failures (cloud) | 0 |
| Reliability | Unknown rate on typical runs | ≤ 5% |
| Performance | Anthropic cache hit rate (batch 2+) | ≥ 90% |
| Hybrid | Cloud cost with 80/20 local/cloud split | ≤ $0.0002/image |
| SDK | Usable in 5 lines without reading CLI source | Pass |
| Learn | Correction rate after 3 `--learn` runs | ≤ 3% |
| Search | P50 keyword query latency (FTS5, 10K images) | ≤ 20ms |
| Search | P50 semantic query latency (flat cosine, 10K images) | ≤ 100ms |
| Search | P50 hybrid query latency (RRF, 10K images) | ≤ 150ms |
| Search | Semantic recall@10 on held-out test queries | ≥ 0.80 |
| Search | Hybrid recall@10 improvement over semantic-only | ≥ +0.10 |
| Embed | Embedding throughput with parallel calls (1K images) | ≤ 60s |
| Scale | ANN query latency (HNSW, 100K images) | ≤ 10ms |
