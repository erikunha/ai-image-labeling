# Tune LLM Prompt

Improve batch or reclassify prompt accuracy for a specific domain or failure pattern.

**Problem:** $ARGUMENTS (e.g. "confuses exterior/interior shots" or "marks burst sequences as unknown")

## Step 1 — Identify the failing prompt

Read both prompts:
- `src/analyzer/batch.ts` → `buildBatchPrompt()` — used for initial batch classification
- `src/analyzer/index.ts` → reclassify prompt inside `reclassifyUnknowns()`

Identify which one is responsible for the described failure.

## Step 2 — Diagnose the root cause

Common patterns:
| Symptom | Root cause |
|---|---|
| Many `unknown` results | Categories not described clearly enough, or model not told to minimise unknowns |
| Burst sequences split across categories | No instruction to treat consecutive similar photos as one category; also consider enabling `--dedupe-threshold` to skip near-identical frames before analysis |
| Wrong category for edge-case images | Two category descriptions overlap — rewrite to be mutually exclusive |
| Reclassify not helping | `detail: 'high'` not set, or reclassify skipped in `--dry-run` |

## Step 3 — Write a minimal reproduction

Run with `--dry-run --verbose --batch-size 5` on a sample of the problematic images:
```bash
node dist/cli/index.js batch \
  --input ./failing-samples \
  --output ./out \
  --dry-run --verbose --batch-size 5
```

Capture the per-image output.

## Step 4 — Edit the prompt

Make the smallest change that addresses the root cause:
- Add a clarifying sentence to the ambiguous category description
- Add an explicit instruction (e.g. "If 3+ consecutive images look identical, assign them the same category")
- Strengthen the "use unknown only as last resort" instruction

Do NOT rewrite the entire prompt — test the minimal delta first.

## Step 5 — Re-run and compare

Run the same `--dry-run --verbose` command with the updated prompt.
Compare unknown rate before and after.

## Step 6 — Update tests

If the prompt structure changed (new instruction, new format requirement):
- Update `tests/analyzer/batch.test.ts` — especially the prompt content assertions
- Verify `npm test` still passes

## Step 7 — Document

Add a comment to `buildBatchPrompt()` or the reclassify prompt explaining WHY the instruction
exists if it's non-obvious (e.g. "burst sequence hint reduces unknown rate by ~15% on real estate datasets").
