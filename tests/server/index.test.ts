import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequestHandler, createDefaultClassifier } from '../../src/server/index.js';
import type { ClassifyFn, ClassifyResult } from '../../src/server/index.js';
import type { AnalysisResult } from '../../src/types.js';
import type { Config } from '../../src/config/index.js';

// Mock search/index.ts so the server's /search route doesn't do real disk I/O
vi.mock('../../src/search/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/search/index.js')>();
  return {
    ...actual,
    loadIndex: vi.fn().mockResolvedValue(null),
    defaultIndexPath: vi.fn().mockReturnValue('/fake/output/analysis_embeddings.index.json'),
  };
});

// Mock search/query.ts
vi.mock('../../src/search/query.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/search/query.js')>();
  return {
    ...actual,
    searchSemantic: vi.fn().mockResolvedValue([]),
    searchKeyword: vi.fn().mockReturnValue([]),
  };
});

// Mock node:fs/promises so keywordFallback can read a fake cache
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: actual.rename,
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock utils and analyzer modules for createDefaultClassifier tests
vi.mock('../../src/utils/mime.js', () => ({
  validateImageMimeType: vi.fn().mockResolvedValue({ valid: true, detectedMime: 'image/jpeg' }),
}));

vi.mock('../../src/utils/exif.js', () => ({
  getImageTimestamp: vi.fn().mockResolvedValue({ createdAt: 1000000, exifSource: 'ctime' }),
}));

vi.mock('../../src/analyzer/index.js', () => ({
  analyzeImages: vi.fn().mockResolvedValue({
    images: [
      {
        file: 'test.jpg',
        fullPath: '/tmp/test.jpg',
        createdAt: 1000000,
        exifSource: 'ctime',
        analysis: {
          category: 'kitchen',
          shortDescription: 'A clean kitchen',
          elements: ['sink'],
          confidence: 0.9,
          extractedText: null,
        },
      },
    ],
    overrideCount: 0,
  }),
}));

function makeServerConfig(): Config {
  return {
    inputDir: './input',
    outputDir: '/fake/output',
    categoryConfig: {
      categories: [{ name: 'kitchen', description: 'Kitchen area' }],
      pinnedLast: [],
      immune: [],
      overridable: [],
      timezone: 'UTC',
    },
    provider: 'openai',
    apiKey: 'test-key',
    anthropicApiKey: '',
    googleApiKey: '',
    model: 'gpt-4o',
    batchSize: 5,
    maxRetries: 2,
    retryDelayMs: 0,
    delayBetweenCallsMs: 0,
    dryRun: false,
    skipAnalysis: false,
    forceSkipAnalysis: false,
    asyncBatch: false,
    resumeBatch: false,
    outputFormat: 'json',
    logFormat: 'pretty',
    verbose: false,
    quiet: false,
    concurrency: 1,
    estimate: false,
    temporalWindowMinutes: 15,
    consensusThreshold: 0.6,
    dedupeThreshold: 0,
    timing: false,
    filenameTemplate: '{n}. Photo of {category} dated {date}',
    watch: false,
    watchPoll: false,
    interactive: false,
    plugins: [],
    linkImages: false,
    linkWindowDays: 7,
    selfCritique: false,
    learn: false,
    activeLearnQueue: false,
    localModel: 'llava',
    cloudProvider: 'openai',
    localConfidenceThreshold: 0.7,
    embed: false,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    category: 'kitchen',
    shortDescription: 'A clean kitchen with modern appliances',
    elements: ['sink', 'tiles'],
    confidence: 0.9,
    extractedText: null,
    ...overrides,
  };
}

/** Start a server with the given classify fn and return its base URL. */
async function startServer(
  classify: ClassifyFn,
  config?: Config,
): Promise<{ url: string; close: () => Promise<void> }> {
  const handler = createRequestHandler(classify, config);
  const server = createServer(async (req, res) => {
    await handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://localhost:${port}`;
  const close = (): Promise<void> =>
    new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return { url, close };
}

// ---------------------------------------------------------------------------
// createDefaultClassifier
// ---------------------------------------------------------------------------

describe('createDefaultClassifier', () => {
  it('returns the analysis result for a valid image', async () => {
    const config = makeServerConfig();
    const classify = createDefaultClassifier(config);
    const result = await classify(Buffer.from('fake-jpeg'), 'test.jpg');
    expect('category' in result).toBe(true);
    if ('category' in result) {
      expect(result.category).toBe('kitchen');
    }
  });

  it('returns error when mime type is invalid', async () => {
    const { validateImageMimeType } = await import('../../src/utils/mime.js');
    vi.mocked(validateImageMimeType).mockResolvedValueOnce({ valid: false, detectedMime: 'text/plain' });

    const config = makeServerConfig();
    const classify = createDefaultClassifier(config);
    const result = await classify(Buffer.from('not-an-image'), 'file.txt');
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toContain('Not a supported image type');
    }
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe('GET /health', () => {
  let url: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const classify: ClassifyFn = vi.fn();
    ({ url, close } = await startServer(classify));
  });
  afterAll(() => close());

  it('returns 200 with status ok', async () => {
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// Unknown routes
// ---------------------------------------------------------------------------

describe('unknown routes', () => {
  let url: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const classify: ClassifyFn = vi.fn();
    ({ url, close } = await startServer(classify));
  });
  afterAll(() => close());

  it('GET /unknown returns 404', async () => {
    const res = await fetch(`${url}/unknown`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('GET / returns 404', async () => {
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /classify — single (octet-stream)
// ---------------------------------------------------------------------------

describe('POST /classify (single, octet-stream)', () => {
  let url: string;
  let close: () => Promise<void>;
  let classify: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    classify = vi.fn();
    ({ url, close } = await startServer(classify as ClassifyFn));
  });
  afterAll(() => close());

  it('returns 400 on empty body', async () => {
    const res = await fetch(`${url}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: '',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 422 when classify returns an error', async () => {
    classify.mockResolvedValueOnce({ error: 'Not a supported image type' } satisfies ClassifyResult);
    const res = await fetch(`${url}/classify?filename=test.txt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('not an image'),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('Not a supported image type');
  });

  it('returns 200 with analysis result on success', async () => {
    const result = makeAnalysisResult();
    classify.mockResolvedValueOnce(result);
    const res = await fetch(`${url}/classify?filename=kitchen.jpg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('fake-jpeg-bytes'),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.category).toBe('kitchen');
    expect(body.confidence).toBe(0.9);
    // classify was called with the filename from query param
    expect(classify).toHaveBeenCalledWith(expect.any(Buffer), 'kitchen.jpg');
  });

  it('strips path separators from filename query param', async () => {
    classify.mockResolvedValueOnce(makeAnalysisResult());
    await fetch(`${url}/classify?filename=../../../etc/passwd`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('bytes'),
    });
    const [, calledFilename] = classify.mock.calls.at(-1) as [Buffer, string];
    expect(calledFilename).not.toContain('/');
    expect(calledFilename).not.toContain('\\');
  });
});

// ---------------------------------------------------------------------------
// POST /classify (JSON batch) and POST /classify/batch
// ---------------------------------------------------------------------------

describe('POST /classify (batch, JSON)', () => {
  let url: string;
  let close: () => Promise<void>;
  let classify: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    classify = vi.fn();
    ({ url, close } = await startServer(classify as ClassifyFn));
  });
  afterAll(() => close());

  it('returns 400 on invalid JSON', async () => {
    const res = await fetch(`${url}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when images array is missing', async () => {
    const res = await fetch(`${url}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [] }),
    });
    expect(res.status).toBe(400);
  });

  it('returns results array for valid batch', async () => {
    const result = makeAnalysisResult();
    classify.mockResolvedValue(result);
    const imageData = Buffer.from('fake-jpeg').toString('base64');
    const res = await fetch(`${url}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: [
          { filename: 'a.jpg', data: imageData },
          { filename: 'b.jpg', data: imageData },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ filename: string; category: string }> };
    expect(body.results).toHaveLength(2);
    expect(body.results[0]?.filename).toBe('a.jpg');
    expect(body.results[0]?.category).toBe('kitchen');
    expect(body.results[1]?.filename).toBe('b.jpg');
  });

  it('includes per-image error when classify returns an error', async () => {
    classify.mockResolvedValueOnce({ error: 'unsupported type' });
    const res = await fetch(`${url}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: [{ filename: 'bad.bin', data: Buffer.from('x').toString('base64') }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { results: Array<{ error?: string }> };
    expect(body.results[0]).toHaveProperty('error');
  });

  it('POST /classify/batch also works', async () => {
    classify.mockResolvedValue(makeAnalysisResult());
    const imageData = Buffer.from('bytes').toString('base64');
    const res = await fetch(`${url}/classify/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: [{ filename: 'c.jpg', data: imageData }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { results: unknown[] };
    expect(body.results).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /search (H9.5)
// ---------------------------------------------------------------------------

describe('GET /search', () => {
  let url: string;
  let close: () => Promise<void>;
  const config = makeServerConfig();

  beforeAll(async () => {
    const classify: ClassifyFn = vi.fn();
    ({ url, close } = await startServer(classify, config));
  });
  afterAll(() => close());

  it('returns 400 when q is missing', async () => {
    const res = await fetch(`${url}/search`);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Missing query parameter');
  });

  it('returns 404 when /search is called without config', async () => {
    // A server started without config should return 404 for /search
    const noConfigServer = await startServer(vi.fn() as ClassifyFn);
    const res = await fetch(`${noConfigServer.url}/search?q=test`);
    expect(res.status).toBe(404);
    await noConfigServer.close();
  });

  it('returns keyword mode results when no index exists', async () => {
    const { searchKeyword } = await import('../../src/search/query.js');
    const mockSearchKeyword = vi.mocked(searchKeyword);
    mockSearchKeyword.mockReturnValueOnce([
      {
        number: 1,
        file: 'img1.jpg',
        outputFile: '1. img1.jpg',
        category: 'kitchen',
        score: 2,
        shortDescription: 'A kitchen with crack',
      },
    ]);

    const res = await fetch(`${url}/search?q=crack`);
    expect(res.status).toBe(200);
    const body = await res.json() as { mode: string; results: unknown[] };
    expect(body.mode).toBe('keyword');
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('returns semantic mode when index exists', async () => {
    const { loadIndex } = await import('../../src/search/index.js');
    const { searchSemantic } = await import('../../src/search/query.js');
    const mockLoadIndex = vi.mocked(loadIndex);
    const mockSearchSemantic = vi.mocked(searchSemantic);

    mockLoadIndex.mockResolvedValueOnce([
      { number: 1, file: 'img1.jpg', vector: [1, 0, 0] },
    ]);
    mockSearchSemantic.mockResolvedValueOnce([
      {
        number: 1,
        file: 'img1.jpg',
        outputFile: '1. img1.jpg',
        category: 'kitchen',
        score: 0.95,
        shortDescription: 'A kitchen',
      },
    ]);

    const res = await fetch(`${url}/search?q=kitchen&top=5&min_score=0.4`);
    expect(res.status).toBe(200);
    const body = await res.json() as { mode: string; results: Array<{ number: number }> };
    expect(body.mode).toBe('semantic');
    expect(body.results[0]?.number).toBe(1);
  });

  it('falls back to keyword when semantic search throws', async () => {
    const { loadIndex } = await import('../../src/search/index.js');
    const { searchSemantic, searchKeyword } = await import('../../src/search/query.js');
    const mockLoadIndex = vi.mocked(loadIndex);
    const mockSearchSemantic = vi.mocked(searchSemantic);
    const mockSearchKeyword = vi.mocked(searchKeyword);

    mockLoadIndex.mockResolvedValueOnce([
      { number: 1, file: 'img1.jpg', vector: [1, 0, 0] },
    ]);
    mockSearchSemantic.mockRejectedValueOnce(new Error('embedding failed'));
    mockSearchKeyword.mockReturnValueOnce([]);

    // keywordFallback reads from the cache — mock readFile to return a valid cache
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        schemaVersion: 1,
        processedDate: '',
        totalImages: 0,
        categories: [],
        categoriesHash: '',
        images: [],
      }),
    );

    const res = await fetch(`${url}/search?q=kitchen`);
    expect(res.status).toBe(200);
    const body = await res.json() as { mode: string };
    expect(body.mode).toBe('keyword');
  });
});
