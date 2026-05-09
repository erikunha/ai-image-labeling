# ADR 003 — Sharp for image processing

| Field    | Value                   |
| -------- | ----------------------- |
| Status   | Accepted                |
| Date     | 2024-01-01              |
| Deciders | @erikhenriquealvescunha |

## Context

The tool must:

1. Resize images before sending to the Vision API (cost and latency reduction).
2. Composite a timestamp overlay onto the final output JPEG.
3. Handle large images (up to 20 MP from professional cameras) without excessive memory use.

Candidates evaluated:

| Library   | Native module | Streaming | Memory | EXIF metadata preserve | Notes                          |
| --------- | ------------- | --------- | ------ | ---------------------- | ------------------------------ |
| **Sharp** | Yes (libvips) | Yes       | Low    | Yes                    | Industry standard for Node     |
| Jimp      | No            | No        | High   | Partial                | Pure JS — slow on large images |
| Canvas    | Yes           | No        | Medium | No                     | Browser-oriented; no EXIF      |

## Decision

Use `sharp` (backed by `libvips`) for all image processing.

Sharp is used in exactly two places:

- `src/analyzer/batch.ts` — resize-for-API only (never write to disk).
- `src/processor/exporter.ts` — composite overlay + encode final JPEG.

No other module imports `sharp`.

## Consequences

**Positive:**

- Streaming pipeline: Sharp processes images without loading the full decoded buffer into memory.
- Native libvips is significantly faster than pure-JS alternatives on large batches.
- `withMetadata()` preserves EXIF, GPS, and ICC profile on output files.
- Active maintenance; first-class Node.js LTS support.

**Negative:**

- Native module: requires platform-specific prebuilt binaries. CI must pin Node.js version and
  architecture; Sharp major version bumps may require CI matrix changes (see Dependabot config).
- HEIC/HEIF support on Linux requires a custom `libvips --with-heif` build (documented in
  known limitations).
- `sharp` cannot be easily mocked at the module level in tests — test files that exercise the
  processor layer must either use real JPEG fixtures or mock the Sharp constructor with `vi.mock`.
