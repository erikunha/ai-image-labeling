# Dev Review — Quality Gate

Run the full quality gate against all uncommitted changes (or `$ARGUMENTS` if a path/diff is given).

## Checklist

Work through every item below. Output a structured report at the end.

### 1. Module boundaries (BLOCK)
- `src/utils/` must NOT import OpenAI, Anthropic, Google LLM SDKs, Sharp, or `fs-extra`
- `src/analyzer/client.ts` is the ONLY file allowed to import any LLM SDK
- `src/analyzer/*.ts` (except `client.ts`) must NOT import LLM SDKs directly
- `src/analyzer/` may import Sharp only in `batch.ts` and `dedup.ts`
- `src/classifier/` must NOT import LLM SDKs, Sharp, or `fs-extra`
- `src/processor/` must NOT import any LLM SDK

Grep: `grep -rn "from 'openai'\|from '@anthropic-ai\|from '@google/generative" src/` (exclude `client.ts`)

### 2. ESM import correctness (BLOCK)
- All relative imports must end in `.js`

Grep: `grep -rn "from '\./[^']*'" src/ tests/` — flag any missing `.js` suffix

### 3. API key safety (BLOCK)
- No `sk-`, `sk-ant-`, `AIza`, `ghp_` literals in source or tests

### 4. TypeScript (BLOCK)
Run: `npm run typecheck` — must pass zero errors

### 5. Tests (BLOCK if coverage drops)
Run: `npm test`
- All tests must pass
- Lines ≥ 75%, Functions ≥ 85%, Branches ≥ 75%
- Config fixtures must include `concurrency: 1`, `estimate: false`, `temporalWindowMinutes: 15`, `consensusThreshold: 0.6`, `dedupeThreshold: 0`
- Mocks must use `LLMClient` interface, never `vi.mock('openai')`

### 6. Lint (WARN)
Run: `npm run lint`

### 7. console.log hygiene (WARN)
- `console.log` allowed only in `src/utils/logger.ts` and `src/utils/progress.ts`

Grep: `grep -rn "console\.\(log\|error\)" src/ --include="*.ts" | grep -v "logger.ts\|progress.ts"`

### 8. Data integrity invariants (BLOCK)
- Final cache write must use `writeJSON(tmp) → rename(tmp, final)`
- `flushPartialCache` must wrap `fs.writeJSON` in try/catch
- `BatchEnvelopeSchema.safeParse()` must guard batch JSON parse
- `CACHE_SCHEMA_VERSION` incremented if `AnalysisCache`/`PartialAnalysisCache` fields changed
- All `AnalysisCache`/`PartialAnalysisCache` literals must include `categoriesHash`

### 9. Security (BLOCK P0, WARN P1)
- LLM `category` field sanitised before use as filesystem path
- `--categories` path resolved to absolute, validated against trusted base
- Parsed `category` validated against known category list before use

### 10. Commit messages (WARN)
- Must follow Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`

## Output format

```
## Quality Gate Report

**Verdict: PASS | WARN | BLOCK**

### ✅ Passing checks
- ...

### ⚠️ Warnings
- ...

### 🚫 Blocking issues
- ISSUE: <description>
  FIX: <how to resolve>
  FILE: <file:line>
```
