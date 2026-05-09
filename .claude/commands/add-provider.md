# Add LLM Provider

Add a new LLM vision provider. Argument: `$ARGUMENTS` (e.g. `mistral - Mistral AI vision API`)

## Steps

### 1. Install the SDK
```bash
npm install <provider-sdk>
```

### 2. Add provider to the union type in `src/config/index.ts`
```typescript
provider: 'openai' | 'anthropic' | 'google' | 'newprovider';
```
Add the new value to the Zod validation enum if one exists.

### 3. Implement the adapter in `src/analyzer/client.ts`
This is the ONLY file allowed to import provider SDKs.

Add a new `else if (config.provider === 'newprovider')` branch that constructs the client
and implements the `LLMClient` interface:
```typescript
complete(prompt: string, images: ImageInput[], opts: CompleteOptions): Promise<CompleteResult>
```

Match the existing pattern:
- Accept `ImageInput[]` — each has `base64: string` and `mimeType: string`
- Map the provider response to `CompleteResult { text: string; tokensUsed?: number }`
- Throw on non-retryable errors (quota/credit errors must NOT be retried — see `retry.ts`)

### 4. Add the API key field to `Config`
- Add `readonly newproviderApiKey: string` to `Config` in `src/config/index.ts`
- Wire it from the CLI flag `--newprovider-api-key` or env var `NEWPROVIDER_API_KEY`
- Add to `validateStartup()`: check key is present when `config.provider === 'newprovider'`

### 5. Update `makeConfig()` in tests
Add `newproviderApiKey: ''` to every `makeConfig()` fixture. TypeScript will flag missing ones.

### 6. Write integration test
In `tests/analyzer/client.test.ts` (or create it), add a test that:
- Passes a mock that returns a canned `LLMResponse`
- Asserts the response is parsed correctly via `analyzeBatch`

Do NOT `vi.mock('newprovider-sdk')` — mock the `LLMClient` interface instead.

### 7. Update `CLAUDE.md` and `README.md`
Add the new provider to the provider table.

### 8. Verify
```bash
npm run typecheck
npm test
npm run lint
```
