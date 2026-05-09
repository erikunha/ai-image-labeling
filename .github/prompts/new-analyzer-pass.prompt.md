---
mode: agent
description: Add a new LLM analysis pass (e.g. condition assessment, damage detection)
---

# Add a new analyzer pass

I want to add a new analysis pass to the image processing pipeline.

**Pass name:** {{PASS_NAME}} (e.g. `damage-assessment`)
**When to run:** {{WHEN}} (e.g. "after the first batch pass, before temporal consensus")
**Input:** {{INPUT}} (e.g. "all analyzed images" or "only images in category X")
**What the LLM should return:** {{LLM_OUTPUT}} (e.g. JSON with `damageLevel`, `affectedArea`)
**New fields to add to the output:** {{NEW_FIELDS}}

Please:

1. Add new fields to the relevant interface in `src/types.ts`
2. Create `src/analyzer/{{PASS_NAME}}.ts` with the analysis function
   - Accept an `LLMClient` (the interface from `src/analyzer/client.ts`) — do NOT import any provider SDK directly
   - May import Sharp only if the pass needs image processing (same rule as `batch.ts` and `dedup.ts`)
   - Call `client.complete(prompt, images, opts)` returning `CompleteResult { text, tokensUsed? }`
   - Validate the LLM JSON response with Zod before accessing fields
3. Wrap the LLM call in `withRetry()` from `../utils/retry.js`
4. Wire the new pass into `analyzeImages()` in `src/analyzer/index.ts`
5. Add the new fields to `ProcessedResult` and the cache JSON output in `src/index.ts`
   - If adding fields to `AnalysisCache`/`PartialAnalysisCache`, increment `CACHE_SCHEMA_VERSION` in `src/types.ts`
6. Write tests in `tests/analyzer/{{PASS_NAME}}.test.ts` — mock the `LLMClient` interface, NOT any SDK constructor
