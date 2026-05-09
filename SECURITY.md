# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: **security@erikhenriquealvescunha.dev** (or open a private GitHub security advisory).

Expect an acknowledgement within 48 hours and a fix or mitigation plan within 14 days.

## API key best practices

Each provider key should be scoped to the minimum required permissions:

- **OpenAI** — Create a project-scoped key restricted to the Vision API (`platform.openai.com/api-keys`). Do not use organisation-level keys.
- **Anthropic** — Use workspace keys scoped to a single workspace (`console.anthropic.com/settings/keys`).
- **Google** — Restrict the key to `generativelanguage.googleapis.com` in the Google Cloud Console (`aistudio.google.com/app/apikey`).
- **AWS Bedrock** — Use an IAM user or role with a policy that grants only `bedrock:InvokeModel` on the specific model ARNs you need. Never use root credentials.
- **Azure OpenAI** — Scope the key to a single Azure OpenAI resource. Prefer managed identity over key-based auth in production.
- **Vertex AI** — Use a service account with only `aiplatform.endpoints.predict` permission, not broad `roles/aiplatform.user`.

Store all keys in `.env` only (already in `.gitignore`). Never commit keys to source control. Rotate keys if you suspect exposure.

## Scope

This tool primarily processes images from a local directory. It also includes a `serve` subcommand that intentionally starts an HTTP server — users must opt in explicitly by running `ai-image-labeling serve`.

External inputs accepted:

1. Local image files from the `--input` directory.
2. LLM responses from the configured provider.
3. HTTP requests to the REST server (when `serve` is running).
4. Webhook response bodies (if `--webhook` is configured).
5. Plugin `.mjs` files loaded via `--plugin`.

### REST server security (`serve` subcommand)

The server binds to `localhost:3000` by default and is not exposed to the network. If you need to expose it:

- Always put a TLS-terminating reverse proxy (nginx, Caddy) in front — the server itself speaks plain HTTP.
- Always set `--serve-api-key <token>` to require a `Bearer` token on every request. Requests without a valid token receive HTTP 401.
- Set `--serve-rate-limit <rpm>` to limit requests per minute per IP and reduce the blast radius of a misconfigured firewall rule.
- Do not run the server as root.

### LLM response sanitisation

LLM responses are validated with Zod before use. Before values from LLM responses are written to `analysis_results.json` or used in output filenames:

- Path-traversal characters (`/`, `\`, null bytes) are stripped from category names and descriptions.
- Field lengths are capped.
- Category names are validated against the known `categories.json` list before being used as filesystem path components.

### HTML report XSS

Every LLM-sourced field (category, shortDescription, fullDescription, elements, extractedText) is HTML-escaped before being embedded in the HTML report. Failure to escape is treated as a security defect.

### Plugin security

Plugins are `.mjs` files that run in the same Node.js process with full access to the filesystem and network. Only load plugins from sources you trust. Plugin paths are resolved to an absolute path before `import()` — they are never passed to `eval` or `exec`.

### Cache integrity

`analysis_results.json` is written via write-temp + atomic rename. It is never truncated in place. If the file is corrupt on next run, the cache is invalidated and a fresh analysis is run.
