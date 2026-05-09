# ADR 001 — ESM with NodeNext module resolution

| Field    | Value                   |
| -------- | ----------------------- |
| Status   | Accepted                |
| Date     | 2024-01-01              |
| Deciders | @erikhenriquealvescunha |

## Context

Node.js supports two module systems: CommonJS (`require`) and ECMAScript Modules (`import`/`export`).
The OpenAI, Anthropic, and Google SDKs are all shipping ESM-first distributions, and `sharp` (our
image processing library) works more reliably in ESM contexts.

TypeScript supports several `module` / `moduleResolution` combinations. `NodeNext` is the strictest
and most correct: it requires explicit `.js` extensions on relative imports (matching the Node.js
runtime expectation) and resolves `exports` fields in `package.json` correctly.

## Decision

Use `"type": "module"` in `package.json` (pure ESM) and `"module": "NodeNext"` /
`"moduleResolution": "NodeNext"` in `tsconfig.json`.

All relative TypeScript imports must use `.js` extensions:

```typescript
import { logger } from './logger.js'; // ✅
import { logger } from './logger'; // ❌ breaks at runtime
```

## Consequences

**Positive:**

- No transpile-time `require()` shims or `createRequire` workarounds.
- `exports` map in third-party packages resolves correctly (critical for provider SDKs).
- Future-proof: Node.js and the ecosystem are converging on ESM.

**Negative:**

- All relative imports require explicit `.js` extension — initially surprising to contributors.
- Some older tooling (e.g. `ts-jest`) does not support NodeNext without extra configuration;
  we use `vitest` instead, which supports native ESM.
- Dynamic `import()` is required for packages that don't yet ship CJS fallbacks.
