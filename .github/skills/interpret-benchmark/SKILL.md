# Skill: Interpret Benchmark Results

## When to use this skill

Use after running `npm run benchmark` (or `npx tsx scripts/benchmark.ts`) to understand
what the numbers mean, whether quality has improved or regressed, and what action to take next.

---

## Steps

### Step 1 — Locate the report files

```bash
ls reports/benchmark/
# → openai.json   anthropic.json   google.json
```

Baseline is at `tests/fixtures/benchmark/baseline.json`.

### Step 2 — Read the key metrics

Each provider report contains:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "runAt": "2025-01-15T14:32:00Z",
  "metrics": {
    "precision": 0.87,
    "recall": 0.83,
    "unknownRate": 0.04,
    "costPer30Images": 0.021,
    "p95LatencyMs": 3200
  },
  "perCategory": {
    "water_damage": { "precision": 0.91, "recall": 0.78 },
    ...
  }
}
```

**Definitions:**

- **Precision** — of images the model labelled as category X, what fraction actually are X (avoids false positives)
- **Recall** — of images that truly are category X, what fraction did the model label correctly (avoids false negatives)
- **Unknown rate** — fraction of images returned as `unknown` (goal: < 10%)
- **Cost per 30 images** — USD cost extrapolated from benchmark fixture set
- **P95 latency** — 95th percentile of per-image API round-trip time in milliseconds

### Step 3 — Compare against baseline

```bash
node -e "
const fs = require('fs');
const base = JSON.parse(fs.readFileSync('tests/fixtures/benchmark/baseline.json', 'utf8'));
const curr = JSON.parse(fs.readFileSync('reports/benchmark/openai.json', 'utf8'));
const bm = base.results?.openai?.metrics ?? {};
const cm = curr.metrics;
if (!bm.precision) { console.log('No baseline yet — run with --update-baseline first'); process.exit(); }
const delta = k => ((cm[k] - bm[k]) * 100).toFixed(1);
console.log('precision Δ:', delta('precision') + '%');
console.log('recall Δ:', delta('recall') + '%');
console.log('unknownRate Δ:', delta('unknownRate') + '%');
console.log('cost Δ:', delta('costPer30Images') + '%');
"
```

Or run the built-in regression check:

```bash
npx tsx scripts/benchmark.ts --provider openai --check-regression
# exit 0 = PASS, exit 1 = REGRESSION
```

### Step 4 — Interpret the results

| Signal                | Meaning                                         | Action                            |
| --------------------- | ----------------------------------------------- | --------------------------------- |
| Precision drops > 5%  | Model now makes more mistakes (false positives) | See Step 5 — improve prompts      |
| Recall drops > 5%     | Model now misses more true positives            | See Step 5 — check descriptions   |
| Unknown rate > 10%    | Model is unsure; categories may be too similar  | See Step 6 — redesign taxonomy    |
| Unknown rate < 2%     | Model is overconfident; may be hallucinating    | Check per-category precision      |
| Cost up > 20%         | Model token usage increased                     | Check if prompt grew unexpectedly |
| P95 latency > 8000 ms | Network or provider degradation                 | Retry benchmark later             |

### Step 5 — Diagnose per-category failures

Look at `perCategory` in the report for the lowest precision/recall categories:

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('reports/benchmark/openai.json','utf8'));
const cats = Object.entries(r.perCategory)
  .sort((a,b) => (a[1].precision + a[1].recall) - (b[1].precision + b[1].recall));
cats.slice(0, 3).forEach(([name, m]) =>
  console.log(name, '| precision:', m.precision?.toFixed(2), '| recall:', m.recall?.toFixed(2))
);
"
```

For the worst-performing categories:

1. Check if their `description` in `categories.json` is visually specific enough
2. Check if they are visually similar to another category (confusion matrix)
3. Use the **tune-prompt** skill to improve `buildBatchPrompt()` for these categories

### Step 6 — Decide: update baseline or file a bug

**Update baseline when:**

- All metrics improved by ≥ 1%
- Unknown rate decreased
- You intentionally changed the categories.json or model

```bash
npx tsx scripts/benchmark.ts --provider openai --update-baseline
git add tests/fixtures/benchmark/baseline.json
git commit -m "chore: update benchmark baseline for openai (precision +3%)"
```

**File a bug (regression) when:**

- Any metric dropped > 5% vs baseline
- The drop is reproducible (run benchmark twice to confirm)
- No intentional change was made

### Step 7 — Cross-provider comparison

When `--provider all` was used:

```bash
node -e "
['openai','anthropic','google'].forEach(p => {
  try {
    const r = JSON.parse(require('fs').readFileSync('reports/benchmark/' + p + '.json','utf8'));
    const m = r.metrics;
    console.log(p.padEnd(12), 'P:', m.precision.toFixed(2), 'R:', m.recall.toFixed(2), 'U:', m.unknownRate.toFixed(2), '$:', m.costPer30Images.toFixed(3));
  } catch { console.log(p, '— no report'); }
});
"
```

Use this to recommend the default provider for a given domain:

- Highest recall → best for high-stakes (don't miss anything)
- Lowest cost → best for high-volume batches
- Lowest unknown rate → best for domains where `unknown` must be rare
