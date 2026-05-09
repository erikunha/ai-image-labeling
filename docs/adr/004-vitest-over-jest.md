# ADR 004 — Vitest over Jest

| Field    | Value                   |
| -------- | ----------------------- |
| Status   | Accepted                |
| Date     | 2024-01-01              |
| Deciders | @erikhenriquealvescunha |

## Context

A test framework is needed that supports:

- Native ESM (no CJS transform, no `babel-jest`, no `ts-jest` transform config).
- TypeScript source maps without `ts-jest` overhead.
- Fast cold start for a watch-mode development workflow.
- `vi.mock()` for dynamic imports (needed to mock `exifr` and `sharp`).

Candidates:

| Framework  | Native ESM            | TS support      | Cold start | Watch mode |
| ---------- | --------------------- | --------------- | ---------- | ---------- |
| **Vitest** | ✅ First-class        | ✅ Native       | Fast       | Excellent  |
| Jest       | ⚠️ Requires transform | ⚠️ Via ts-jest  | Slow       | Good       |
| Node test  | ✅                    | ⚠️ Via tsx flag | Fast       | None       |

## Decision

Use `vitest` with `globals: true` and `environment: 'node'`. No transform configuration required.

Coverage is collected with `@vitest/coverage-v8` (uses V8's native coverage — faster than Istanbul
and no instrumentation overhead).

## Consequences

**Positive:**

- Zero transform configuration: Vitest understands TypeScript natively via Vite's pipeline.
- `vi.mock()` works correctly with dynamic `import()` calls (critical for `exifr` mock).
- `globals: true` means `describe`, `it`, `expect`, `vi` are available without explicit imports
  (matches Jest's API; lowers onboarding friction).
- Watch mode re-runs only affected test files on change.

**Negative:**

- Vitest's minor version releases occasionally change snapshot serialization or mock behaviour —
  pin to a minor range in `package.json`.
- The `globals: true` option requires `"types": ["vitest/globals"]` in `tsconfig.json` for
  correct IDE type resolution without explicit imports.
- V8 coverage can report slightly different branch counts than Istanbul for ternary expressions.
