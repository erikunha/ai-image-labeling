#!/usr/bin/env bash
# test-gate/run-checks.sh
# Runs TypeScript type-check and Vitest unit tests at the end of a Copilot session.
# Set FAIL_MODE=block to exit non-zero on failure (prevents auto-commit).
# Set FAIL_MODE=warn (default) to log failures without blocking.

set -uo pipefail

FAIL_MODE="${FAIL_MODE:-warn}"
ERRORS=0

echo ""
echo "🔍 Test Gate: running pre-commit checks..."
echo ""

# ── 1. Type check ──────────────────────────────────────────────────────────────
echo "→ npm run typecheck"
if npm run typecheck 2>&1; then
  echo "  ✅ Type check passed"
else
  echo "  ❌ Type errors detected — run 'npm run typecheck' to see details"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ── 2. Unit tests ──────────────────────────────────────────────────────────────
echo "→ npm test"
if npm test 2>&1; then
  echo "  ✅ All tests passed"
else
  echo "  ❌ Test failures detected — run 'npm test' to see details"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# ── 3. Lint ────────────────────────────────────────────────────────────────────
echo "→ npm run lint"
if npm run lint 2>&1; then
  echo "  ✅ Lint passed"
else
  echo "  ⚠️  Lint errors detected — run 'npm run lint:fix' to auto-fix"
  # Lint is warn-only even in block mode
fi

echo ""

# ── Summary ────────────────────────────────────────────────────────────────────
if [ "$ERRORS" -eq 0 ]; then
  echo "✅ All checks passed — safe to commit."
  exit 0
else
  echo "⚠️  $ERRORS check(s) failed."
  if [ "$FAIL_MODE" = "block" ]; then
    echo "🚫 Session blocked: fix the errors above before committing."
    echo "   Set FAIL_MODE=warn in hooks.json to log without blocking."
    exit 1
  else
    echo "💡 Set FAIL_MODE=block in .github/hooks/test-gate/hooks.json to block commits on failure."
    exit 0
  fi
fi
