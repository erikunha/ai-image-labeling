# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: **security@erikhenriquealvescunha.dev** (or open a private GitHub security advisory).

Expect an acknowledgement within 48 hours and a fix or mitigation plan within 14 days.

## API key best practices

Each provider should be scoped to the minimum required permissions:

- **OpenAI** — Create a project-scoped key restricted to the Vision API
  (`platform.openai.com/api-keys`). Do not use organisation-level keys.
- **Anthropic** — Use workspace keys scoped to a single workspace
  (`console.anthropic.com/settings/keys`).
- **Google** — Restrict the key to `generativelanguage.googleapis.com` in the
  Google Cloud Console (`aistudio.google.com/app/apikey`).

Store keys in `.env` only (already in `.gitignore`). Never commit API keys to source control.

## Scope

This tool runs locally and does not expose network services, start servers, or accept external
input from untrusted sources other than:

1. Local image files (from `--input` directory).
2. LLM responses from the configured provider.

LLM responses are sanitised before being written to `analysis_results.json`:
path-traversal characters (`/`, `\`, null bytes) are stripped from category names and
descriptions, and field lengths are capped before use in output filenames.
