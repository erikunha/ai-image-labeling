---
applyTo: 'scripts/**'
---

# Scripts — Copilot instructions

## Purpose

`scripts/` contains developer-facing TypeScript utilities run with `tsx` (not compiled to `dist/`).
They are NOT part of the production bundle. Never import them from `src/`.

## Existing scripts

| Script                           | Purpose                                                            | npm alias                    |
| -------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `generate-fixtures.ts`           | Creates synthetic JPEG test fixtures in `tests/fixtures/images/`   | `npm run fixtures`           |
| `generate-benchmark-fixtures.ts` | Creates 24 labelled benchmark JPEGs in `tests/fixtures/benchmark/` | `npm run benchmark:generate` |
| `benchmark.ts`                   | Runs accuracy/cost/latency benchmark across LLM providers          | `npm run benchmark`          |
| `gen-readme-flags.ts`            | Auto-generates the CLI flags table in `README.md`                  | `npm run readme:generate`    |

## Rules for new scripts

1. **Always use `tsx`** — scripts are `.ts` files run directly; do not compile them
2. **All relative imports must end in `.js`** (NodeNext ESM rule applies everywhere in this repo)
3. **Read-only by default** — scripts that mutate `src/` or `tests/` must print a `[dry-run]` mode output first
4. **No `process.exit(0)` in happy path** — only `process.exit(1)` in error handlers
5. **Import from `src/`** is allowed (scripts are tools that use the library), but only through public exports in `src/index.ts`, `src/config/index.ts`, `src/utils/`, and `src/analyzer/index.ts`
6. **Never import from `src/cli/`** — CLI wiring is Commander-specific and not intended for script reuse
7. **Minimal arg parsing** — use plain `process.argv` parsing; do not add Commander or yargs as deps for scripts

## Benchmark script conventions

- Results written to `reports/benchmark/<provider>.json` (git-ignored)
- Baseline stored in `tests/fixtures/benchmark/baseline.json` (git-tracked; update via `--update-baseline`)
- Regression threshold: 5% on precision, recall, and unknown-rate
- All three providers compared: `openai`, `anthropic`, `google`
- The `--check-regression` flag must exit with code 1 if any metric regresses

## Fixture generator conventions

- Check `access()` before writing — never overwrite an existing fixture
- Log a summary line: `[fixtures] N images ready in <path>`
- Use Sharp for image creation — JPEG quality 80–85, raw pixel buffer input
- EXIF timestamps via Sharp `withMetadata()` — use `Copyright` field in `IFD0` as a timestamp carrier (limitation of Sharp API)
