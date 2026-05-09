| name        | Test Gate                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------- |
| description | Runs TypeScript type-check, Vitest tests, and ESLint at the end of a Copilot coding session |
| tags        | typescript, testing, quality                                                                |

# Test Gate Hook

Automatically runs `npm run typecheck`, `npm test`, and `npm run lint` when a Copilot coding
agent session ends — acting as a lightweight pre-commit quality gate.

## Overview

AI coding agents can introduce type errors or break tests without immediately noticing. This hook
catches regressions before they are committed by running the project's three core quality checks
at session end.

## Installation

1. Copy the hook folder to your repository:

   ```bash
   cp -r .github/hooks/test-gate .github/hooks/
   ```

2. Make the script executable:

   ```bash
   chmod +x .github/hooks/test-gate/run-checks.sh
   ```

3. Commit the hook configuration to your repository's default branch.

## Configuration

Set `FAIL_MODE` in `hooks.json`:

| Variable    | Values          | Default | Description                                   |
| ----------- | --------------- | ------- | --------------------------------------------- |
| `FAIL_MODE` | `warn`, `block` | `warn`  | `block` exits non-zero to prevent auto-commit |

**Recommended:** Start with `warn` to observe failures, then switch to `block` once stable.

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [
      {
        "type": "command",
        "bash": ".github/hooks/test-gate/run-checks.sh",
        "cwd": ".",
        "env": { "FAIL_MODE": "block" },
        "timeoutSec": 120
      }
    ]
  }
}
```

## Example output

```
🔍 Test Gate: running pre-commit checks...

→ npm run typecheck
  ✅ Type check passed

→ npm test
  ✅ All tests passed

→ npm run lint
  ✅ Lint passed

✅ All checks passed — safe to commit.
```

## Timeout

The default timeout is 120 seconds. If your test suite is slow, increase `timeoutSec`. The
type-check and lint are fast (~5s each); tests typically complete in under 10s for this project.
