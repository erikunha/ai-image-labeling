# ADR 002 — Single LLM adapter (`LLMClient` interface)

| Field    | Value                   |
| -------- | ----------------------- |
| Status   | Accepted                |
| Date     | 2024-01-01              |
| Deciders | @erikhenriquealvescunha |

## Context

The tool supports three LLM providers: OpenAI, Anthropic, and Google Gemini. Each SDK has a
different API surface, authentication model, streaming behaviour, and error format.

The first version called the OpenAI SDK directly from `batch.ts`. Adding Anthropic support
required either forking the call site or adding a provider `if/else` chain throughout the
analysis layer.

## Decision

Define a single `LLMClient` interface in `src/analyzer/client.ts`:

```typescript
interface LLMClient {
  complete(prompt: string, images: ImageInput[], opts: CompleteOptions): Promise<CompleteResult>;
}
```

`src/analyzer/client.ts` is the **only** file allowed to import provider SDKs.
All other modules receive a `LLMClient` instance and call `.complete()`.

## Consequences

**Positive:**

- Adding a new provider requires changes in exactly one file (`client.ts`).
- Unit tests mock the `LLMClient` interface — they never touch real network calls.
- The `detail: low/high` hint is abstracted; providers that don't support it ignore it gracefully.
- Swapping the default model for a provider is a one-line change.

**Negative:**

- Provider-specific features (streaming, function calling, extended thinking) cannot be exposed
  through the current interface without extending it — each extension touches all adapters.
- The interface is deliberately minimal; a richer feature set would require a breaking interface
  change and a corresponding bump to `CACHE_SCHEMA_VERSION`.
