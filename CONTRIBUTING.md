# Contributing to ai-image-labeling

Thank you for considering a contribution! This document covers everything you need to go from
zero to a passing pull request.

---

## Table of contents

1. [First-time setup](#first-time-setup)
2. [Running commands](#running-commands)
3. [Module boundary rules](#module-boundary-rules)
4. [Adding a new LLM provider](#adding-a-new-llm-provider)
5. [Adding a category example file](#adding-a-category-example-file)
6. [Adding a CLI flag](#adding-a-cli-flag)
7. [Testing](#testing)
8. [Pull request checklist](#pull-request-checklist)
9. [Commit message format](#commit-message-format)

---

## First-time setup

```bash
# 1. Fork and clone
git clone https://github.com/erikunha/ai-image-labeling.git
cd ai-image-labeling

# 2. Install dependencies (includes dev deps)
pnpm install

# 3. Copy the example env file and fill in at least one API key
cp .env.example .env
# edit .env → set OPENAI_API_KEY (or ANTHROPIC_API_KEY / GOOGLE_API_KEY)

# 4. Generate test fixture images (100×100 JPEGs used by the test suite)
pnpm run fixtures

# 5. Verify everything passes
pnpm run check
```

`.nvmrc` contains `22` — if you use `nvm` or `fnm`, run `nvm use` / `fnm use` to switch.

---

## Running commands

| Command                                              | Purpose                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| `pnpm run build`                                     | Compile TypeScript → `dist/`                     |
| `pnpm run typecheck`                                 | Type-check `src/` without emitting               |
| `pnpm exec tsc -p scripts/tsconfig.json --noEmit`   | Type-check `scripts/` without emitting           |
| `pnpm run lint`                                      | ESLint                                           |
| `pnpm run lint:fix`                                  | ESLint with auto-fix                             |
| `pnpm run format`                                    | Prettier                                         |
| `pnpm test`                                          | Vitest unit tests (fast, no coverage)            |
| `pnpm run test:coverage`                             | Vitest with V8 coverage report                   |
| `pnpm run fixtures`                                  | Regenerate test fixture images                   |
| `pnpm run check`                                     | lint + typecheck + test:coverage (the full gate) |

---

## Module boundary rules

Imports between modules are strictly controlled:

| Directory                | Allowed imports                                        | Forbidden                          |
| ------------------------ | ------------------------------------------------------ | ---------------------------------- |
| `src/utils/`             | Node stdlib only                                       | OpenAI, Sharp, fs-extra            |
| `src/analyzer/client.ts` | utils/, config/, types, all three provider SDKs        | processor/, classifier/            |
| `src/analyzer/`          | utils/, config/, types, LLMClient, Sharp (resize only) | processor/, classifier/, any SDK   |
| `src/processor/`         | utils/, config/, types, Sharp                          | any LLM SDK, analyzer/             |
| `src/classifier/`        | config/, types                                         | any LLM SDK, Sharp, fs-extra       |
| `src/cli/`               | config/, index, utils/logger                           | analyzer/, processor/, classifier/ |
| `src/index.ts`           | All src/ modules                                       | external packages directly         |

Violations are caught by ESLint and the `Dev Reviewer` agent.

---

## Adding a new LLM provider

1. **Add API key config** — in `src/config/index.ts`:
   - Add `yourProviderApiKey: string` to the `Config` interface.
   - Add `YOUR_PROVIDER_API_KEY` to `loadConfig()` (env var + CLI flag precedence).
   - Add the billing URL to the `BILLING_URL` map in `validateStartup()`.

2. **Implement the adapter** — in `src/analyzer/client.ts`:
   - Add `'your-provider'` to the `Provider` union type.
   - Create a `createYourProviderClient(config: Config): LLMClient` function.
   - Wire it into the `createClient(config)` factory switch.

3. **Add CLI flag** — in `src/cli/index.ts`:
   - Add `--your-provider-api-key <key>` option to the program.
   - Pass it through to `loadConfig()`.

4. **Update help text** — in `src/cli/help.ts`.

5. **Write a contract test** (optional, skipped in normal CI) — see `tests/analyzer/client.contract.test.ts`.

6. **Update README** — add the provider to the Quick Start and CLI reference table.

### Skeleton

```typescript
// src/analyzer/client.ts
function createYourProviderClient(config: Config): LLMClient {
  // Import the SDK at the top of client.ts
  const client = new YourProviderSDK({ apiKey: config.yourProviderApiKey });

  return {
    async complete(prompt, images, opts) {
      // Build the request payload using `prompt` and `images`
      // Return { text: string, tokensUsed: number }
    },
  };
}
```

---

## Adding a category example file

Categories are domain-specific JSON files in `examples/`. The schema:

```jsonc
{
  "description": "Human-readable description of the domain",
  "timezone": "Europe/London", // IANA timezone string
  "categories": [
    { "name": "category_name", "description": "Short description for the LLM prompt" },
  ],
  "pinnedLast": ["payment_receipt"], // Always sorted to end of output
  "immune": ["payment_receipt"], // Never overridden by temporal consensus
  "overridable": ["unknown"], // Can be overridden by 60%-majority cluster vote
}
```

Add your file as `examples/categories-<domain>.json` and test it by pointing `--categories` at it.

---

## Adding a CLI flag

1. Add the field to the `Config` interface and `RawCliOptions` in `src/config/index.ts`.
2. Parse the env var and provide a default in `loadConfig()`.
3. Add `program.option('--your-flag <value>', 'Description', defaultValue)` in `src/cli/index.ts`.
4. Add an entry to the flags table in `src/cli/help.ts`.
5. Update the CLI reference table in `README.md`.

---

## Testing

- All tests live in `tests/` mirroring `src/`.
- **Mock the `LLMClient` interface** — do not mock individual SDK constructors.
- **Pure functions** (classifier, overlay math, retry logic) need no mocks.
- **Processor tests** that need real JPEG files: use `FIXTURES_DIR` from `tests/fixtures/index.ts`.
  Run `pnpm run fixtures` first if the directory is absent.
- `src/cli/` and `src/index.ts` are intentionally excluded from coverage (integration territory).

```bash
# Run all tests
pnpm test

# Run a single file
pnpm exec vitest run tests/utils/exif.test.ts

# Run with coverage
pnpm run test:coverage
```

Coverage thresholds (enforced in CI): lines ≥ 75%, functions ≥ 85%, branches ≥ 75%.

---

## Pull request checklist

Before opening a PR, ensure all of the following pass locally:

- [ ] `pnpm run lint` — zero ESLint errors
- [ ] `pnpm run typecheck` — zero TypeScript errors
- [ ] `pnpm exec tsc -p scripts/tsconfig.json --noEmit` — zero TypeScript errors in scripts/
- [ ] `pnpm run test:coverage` — all tests pass, coverage thresholds met
- [ ] No LLM SDK imported outside `src/analyzer/client.ts`
- [ ] No `sharp` imported outside `src/processor/` and `src/analyzer/batch.ts`
- [ ] All relative imports use `.js` extension
- [ ] No new `console.log` outside `src/utils/logger.ts` and `src/utils/progress.ts`
- [ ] No API keys hardcoded or logged

---

## Commit message format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `chore`, `test`, `docs`, `refactor`, `perf`

Examples:

```
feat: add --estimate flag for pre-run cost preview
fix: prevent ctime reset on rsync by using EXIF DateTimeOriginal
test: add analyzeBatch unit tests with LLMClient mock
docs: update CLI reference for --concurrency flag
refactor: extract parseAnalysisResult into analyzer/batch.ts
```
