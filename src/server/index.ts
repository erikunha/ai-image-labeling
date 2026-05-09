import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeImages } from '../analyzer/index.js';
import type { Config } from '../config/index.js';
import type { AnalysisCache, AnalysisResult } from '../types.js';
import { getImageTimestamp } from '../utils/exif.js';
import { logger } from '../utils/logger.js';
import { validateImageMimeType } from '../utils/mime.js';
import { searchSemantic, searchKeyword } from '../search/query.js';
import type { SearchResult } from '../search/query.js';
import { loadIndex, defaultIndexPath } from '../search/index.js';
import { RateLimiter } from './rate-limiter.js';

export const DEFAULT_SERVER_PORT = 3000;

export type ClassifyResult = AnalysisResult | { error: string };

/** Returns a classify function backed by real LLM analysis and temp-file I/O. */
export function createDefaultClassifier(config: Config): ClassifyFn {
  return async (buffer: Buffer, filename: string): Promise<ClassifyResult> => {
    const tmpDir = join(tmpdir(), 'ai-image-labeling-server');
    await mkdir(tmpDir, { recursive: true });
    const tmpFile = join(tmpDir, `${randomBytes(8).toString('hex')}-${filename}`);
    try {
      await writeFile(tmpFile, buffer);
      const { valid, detectedMime } = await validateImageMimeType(tmpFile);
      if (!valid) {
        return { error: `Not a supported image type (detected: ${detectedMime ?? 'unknown'})` };
      }
      const { createdAt, exifSource } = await getImageTimestamp(tmpFile);
      const { images } = await analyzeImages(
        [{ file: filename, fullPath: tmpFile, createdAt, exifSource }],
        config,
      );
      const analyzed = images[0];
      if (!analyzed) return { error: 'Analysis returned no results' };
      return analyzed.analysis;
    } finally {
      await unlink(tmpFile).catch(() => undefined);
    }
  };
}

/**
 * Function that classifies a single image buffer. Injectable for testing.
 * Returns an AnalysisResult on success or `{ error: string }` on failure.
 */
export type ClassifyFn = (buffer: Buffer, filename: string) => Promise<ClassifyResult>;

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(data);
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function logRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  ip: string,
  logFormat: string,
): void {
  const timestamp = new Date().toISOString();
  if (logFormat === 'json') {
    process.stdout.write(
      JSON.stringify({ method, path, status, durationMs, ip, timestamp }) + '\n',
    );
  } else {
    process.stdout.write(
      `[access] ${timestamp} ${method} ${path} ${status} ${durationMs}ms ${ip}\n`,
    );
  }
}

function buildOpenApiSpec(hasAuth: boolean): unknown {
  const securityEntry = [{ BearerAuth: [] }];
  const routeSecurity = hasAuth ? { security: securityEntry } : {};

  return {
    openapi: '3.1.0',
    info: {
      title: 'ai-image-labeling API',
      version: '2.2.0',
      description: 'REST API for AI-powered image classification',
    },
    ...(hasAuth ? { security: securityEntry } : {}),
    paths: {
      '/health': {
        get: {
          summary: 'Liveness check',
          description: 'Always unauthenticated. Returns 200 when the server is up.',
          security: [],
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'OpenAPI 3.1 specification',
          description: 'Returns this spec. Always unauthenticated.',
          security: [],
          responses: { '200': { description: 'OpenAPI document' } },
        },
      },
      '/search': {
        get: {
          summary: 'Search classified images',
          description: 'Semantic search (requires prior --embed run) or keyword fallback.',
          ...routeSecurity,
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Search query text',
            },
            {
              name: 'top',
              in: 'query',
              schema: { type: 'integer', default: 10 },
              description: 'Max results to return',
            },
            {
              name: 'min_score',
              in: 'query',
              schema: { type: 'number', default: 0.5 },
              description: 'Min similarity score (semantic mode only)',
            },
          ],
          responses: {
            '200': {
              description: 'Ranked search results',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['mode', 'results'],
                    properties: {
                      mode: { type: 'string', enum: ['semantic', 'keyword'] },
                      results: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/SearchResult' },
                      },
                    },
                  },
                },
              },
            },
            '400': { description: 'Missing query parameter' },
          },
        },
      },
      '/classify': {
        post: {
          summary: 'Classify an image (single or batch)',
          description:
            'Send application/octet-stream for a single image with ?filename=. Send application/json with {images:[{filename,data}]} for a batch.',
          ...routeSecurity,
          requestBody: {
            required: true,
            content: {
              'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
              'application/json': { schema: { $ref: '#/components/schemas/BatchRequest' } },
            },
          },
          responses: {
            '200': { description: 'Analysis result or batch results array' },
            '400': { description: 'Bad request (empty body or invalid JSON)' },
            '401': { description: 'Unauthorized — valid Bearer token required' },
            '422': { description: 'Unsupported image type' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
      '/classify/batch': {
        post: {
          summary: 'Classify a batch of images',
          description: 'Alias for POST /classify with application/json body.',
          ...routeSecurity,
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/BatchRequest' } },
            },
          },
          responses: {
            '200': { description: 'Batch results' },
            '401': { description: 'Unauthorized' },
            '429': { description: 'Rate limit exceeded' },
          },
        },
      },
    },
    components: {
      ...(hasAuth ? { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer' } } } : {}),
      schemas: {
        AnalysisResult: {
          type: 'object',
          required: ['category', 'shortDescription', 'elements', 'confidence'],
          properties: {
            category: { type: 'string' },
            shortDescription: { type: 'string' },
            elements: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            extractedText: { type: ['string', 'null'] },
          },
        },
        BatchRequest: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              items: {
                type: 'object',
                required: ['filename', 'data'],
                properties: {
                  filename: { type: 'string' },
                  data: {
                    type: 'string',
                    format: 'byte',
                    description: 'Base64-encoded image bytes',
                  },
                },
              },
            },
          },
        },
        SearchResult: {
          type: 'object',
          properties: {
            number: { type: 'integer' },
            file: { type: 'string' },
            outputFile: { type: 'string' },
            category: { type: 'string' },
            score: { type: 'number' },
            shortDescription: { type: 'string' },
          },
        },
      },
    },
  };
}

/**
 * Creates the HTTP request handler for the classification API.
 * Accepts an injectable `classify` function so tests can stub the analysis step.
 *
 * Routes:
 *   GET  /health           — liveness check (always unauthenticated)
 *   GET  /openapi.json     — OpenAPI 3.1 spec (always unauthenticated)
 *   GET  /search           — semantic or keyword search
 *   POST /classify         — classify a single image (octet-stream body, ?filename=)
 *                           — or batch (JSON body: { images: [{filename, data}] })
 *   POST /classify/batch   — batch variant (always expects JSON)
 *
 * Security (when config fields are set):
 *   - Bearer token auth: all routes except /health and /openapi.json require
 *     Authorization: Bearer <token> matching config.serveApiKey
 *   - Rate limiting: sliding-window per source IP (config.serveRateLimit req/min)
 *   - Access logging: one JSON line per request when config.serveLogRequests is true
 */
export function createRequestHandler(
  classify: ClassifyFn,
  config?: Config,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const rateLimiter = config?.serveRateLimit ? new RateLimiter(config.serveRateLimit) : null;

  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startMs = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const ip = req.socket.remoteAddress ?? 'unknown';

    try {
      // Rate limiting — skip for health endpoint
      if (rateLimiter && url.pathname !== '/health') {
        const { allowed, retryAfterSeconds } = rateLimiter.check(ip);
        if (!allowed) {
          res.writeHead(429, {
            'Retry-After': String(retryAfterSeconds),
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify({ error: 'Too Many Requests' }));
          return;
        }
      }

      // Bearer token auth — skip for health and openapi.json
      const skipAuth = url.pathname === '/health' || url.pathname === '/openapi.json';
      if (config?.serveApiKey && !skipAuth) {
        const authHeader = req.headers['authorization'] ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
        if (token !== config.serveApiKey) {
          res.writeHead(401, { 'WWW-Authenticate': 'Bearer', 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      // Route dispatch
      if (req.method === 'GET' && url.pathname === '/health') {
        jsonResponse(res, 200, { status: 'ok' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/openapi.json') {
        jsonResponse(res, 200, buildOpenApiSpec(Boolean(config?.serveApiKey)));
        return;
      }

      if (req.method === 'GET' && url.pathname === '/search' && config) {
        await handleSearchRoute(req, res, config, url);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/classify') {
        const ct = (req.headers['content-type'] ?? '').toLowerCase();
        if (ct.includes('application/json')) {
          await handleBatchRoute(req, res, classify);
        } else {
          await handleSingleRoute(req, res, classify, url);
        }
        return;
      }

      if (req.method === 'POST' && url.pathname === '/classify/batch') {
        await handleBatchRoute(req, res, classify);
        return;
      }

      jsonResponse(res, 404, { error: 'Not found' });
    } finally {
      if (config?.serveLogRequests) {
        logRequest(
          req.method ?? 'GET',
          url.pathname,
          res.statusCode,
          Date.now() - startMs,
          ip,
          config.logFormat,
        );
      }
    }
  };
}

async function handleSingleRoute(
  req: IncomingMessage,
  res: ServerResponse,
  classify: ClassifyFn,
  url: URL,
): Promise<void> {
  const rawFilename = url.searchParams.get('filename') ?? 'upload.jpg';
  const filename = rawFilename.replace(/[/\\]/g, '_');

  const body = await readBody(req);
  if (body.length === 0) {
    jsonResponse(res, 400, { error: 'Empty request body' });
    return;
  }

  const result = await classify(body, filename);
  if ('error' in result) {
    jsonResponse(res, 422, { error: result.error });
    return;
  }
  jsonResponse(res, 200, result);
}

interface BatchRequestBody {
  images: Array<{ filename: string; data: string }>;
}

async function handleBatchRoute(
  req: IncomingMessage,
  res: ServerResponse,
  classify: ClassifyFn,
): Promise<void> {
  const raw = await readBody(req);
  let parsed: BatchRequestBody;
  try {
    parsed = JSON.parse(raw.toString('utf8')) as BatchRequestBody;
  } catch {
    jsonResponse(res, 400, { error: 'Invalid JSON body' });
    return;
  }

  if (!Array.isArray(parsed.images) || parsed.images.length === 0) {
    jsonResponse(res, 400, { error: 'Body must contain a non-empty "images" array' });
    return;
  }

  const results: Array<{ filename: string } & (AnalysisResult | { error: string })> = [];
  for (const img of parsed.images) {
    const safeName = (img.filename ?? 'unknown').replace(/[/\\]/g, '_');
    if (typeof img.filename !== 'string' || typeof img.data !== 'string') {
      results.push({ filename: safeName, error: 'Each entry must have "filename" and "data"' });
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(img.data, 'base64');
    } catch {
      results.push({ filename: safeName, error: 'Invalid base64 data' });
      continue;
    }
    const result = await classify(buffer, safeName);
    results.push({ filename: safeName, ...result });
  }
  jsonResponse(res, 200, { results });
}

async function handleSearchRoute(
  _req: IncomingMessage,
  res: ServerResponse,
  config: Config,
  url: URL,
): Promise<void> {
  const q = url.searchParams.get('q');
  const topRaw = url.searchParams.get('top');
  const minScoreRaw = url.searchParams.get('min_score');
  const top = Math.max(1, parseInt(topRaw ?? '10', 10) || 10);
  const minScore = parseFloat(minScoreRaw ?? '0.5') || 0.5;
  const outputDir = config.outputDir;

  const indexPath = defaultIndexPath(outputDir);
  const indexEntries = await loadIndex(indexPath);
  const hasIndex = indexEntries !== null && indexEntries.length > 0;

  let results: SearchResult[];
  let mode: 'semantic' | 'keyword';

  if (q && hasIndex) {
    try {
      results = await searchSemantic(q, outputDir, config, { topK: top, minScore });
      mode = 'semantic';
    } catch {
      results = await keywordFallback(q, outputDir, top);
      mode = 'keyword';
    }
  } else if (q) {
    results = await keywordFallback(q, outputDir, top);
    mode = 'keyword';
  } else {
    jsonResponse(res, 400, { error: 'Missing query parameter: q' });
    return;
  }

  jsonResponse(res, 200, { results, mode });
}

async function keywordFallback(
  keyword: string,
  outputDir: string,
  topK: number,
): Promise<SearchResult[]> {
  const cachePath = join(outputDir, 'analysis_results.json');
  let raw: string;
  try {
    raw = await readFile(cachePath, 'utf-8');
  } catch {
    return [];
  }
  const cache = JSON.parse(raw) as AnalysisCache;
  return searchKeyword(keyword, cache.images, { topK });
}

/**
 * Start the HTTP classification server.
 * Listens until SIGINT/SIGTERM, then shuts down gracefully.
 */
export async function runServe(config: Config, port = DEFAULT_SERVER_PORT): Promise<void> {
  const classify = createDefaultClassifier(config);
  const handler = createRequestHandler(classify, config);

  const server = createServer(async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      logger.error(`[server] ${(err as Error).message}`);
      if (!res.headersSent) {
        jsonResponse(res, 500, { error: 'Internal server error' });
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, () => {
      logger.info(`\n Server listening on http://localhost:${port}`);
      logger.info(`  GET  /health         — liveness check (always unauthenticated)`);
      logger.info(`  GET  /openapi.json   — OpenAPI 3.1 spec`);
      logger.info(`  GET  /search?q=...   — semantic or keyword search`);
      logger.info(`  POST /classify       — classify single image (octet-stream, ?filename=)`);
      logger.info(`  POST /classify       — classify batch (JSON: {images:[{filename,data}]})`);
      logger.info(`  POST /classify/batch — batch alias`);
      if (config.serveApiKey) {
        logger.info(
          `  Auth:       Bearer token required on all routes except /health and /openapi.json`,
        );
      }
      if (config.serveRateLimit) {
        logger.info(`  Rate limit: ${config.serveRateLimit} req/min per IP`);
      }
      if (config.serveLogRequests) {
        logger.info(`  Logging:    request access log enabled`);
      }
      resolve();
    });
    server.once('error', reject);
  });

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      logger.info('\n Server shutting down.');
      server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
