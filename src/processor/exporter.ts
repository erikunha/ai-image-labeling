import path from 'node:path';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import {
  buildTimestampSvg,
  calculateFontSize,
  calculateOverlayPosition,
  formatTimestamp,
} from './overlay.js';

export interface ExportOptions {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly timestampMs: number;
  readonly skipOverlay: boolean;
  readonly timezone: string;
  readonly dryRun?: boolean;
}

export async function exportImage(options: ExportOptions): Promise<void> {
  const { inputPath, outputPath, timestampMs, skipOverlay, timezone, dryRun } = options;

  if (dryRun) {
    logger.verbose(`  [dry-run] Would write: ${path.basename(outputPath)}`);
    return;
  }

  const image = sharp(inputPath);
  const { width = 1000, height = 1000 } = await image.metadata();

  if (skipOverlay) {
    await image
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: false })
      .withMetadata()
      .toFile(outputPath);
    return;
  }

  const fontSize = calculateFontSize(height);
  const dateText = formatTimestamp(timestampMs, timezone);
  const { svg, overlayWidth, overlayHeight } = buildTimestampSvg(dateText, fontSize);
  const { left, top } = calculateOverlayPosition(width, height, overlayWidth, overlayHeight);

  await image
    .composite([{ input: svg, top, left }])
    .jpeg({ quality: 100, chromaSubsampling: '4:4:4', mozjpeg: false })
    .withMetadata()
    .toFile(outputPath);
}

/** Default output filename template — mirrors the original hard-coded format. */
const DEFAULT_TEMPLATE = '{n}. Photo of {category} dated {date}';

/** Strip characters that can cause path traversal or filesystem issues in filename segments. */
function sanitizeSegment(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[/\\<>:|?*\x00]/g, '');
}

export function buildOutputName(
  number: number,
  category: string,
  timestampMs: number,
  timezone: string,
  keepOriginalBasename?: string,
  template?: string,
  description?: string,
): string {
  if (keepOriginalBasename) {
    return `${path.basename(keepOriginalBasename, path.extname(keepOriginalBasename))}.jpeg`;
  }

  const tpl = template ?? DEFAULT_TEMPLATE;
  const numPadded = String(number).padStart(3, '0');
  const date = new Date(timestampMs);
  const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const d = String(local.getDate()).padStart(2, '0');
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const y = local.getFullYear();
  const hh = String(local.getHours()).padStart(2, '0');
  const min = String(local.getMinutes()).padStart(2, '0');

  const safeCategory = sanitizeSegment((category || 'unknown').toLowerCase().replace(/_/g, ' '));
  const descSlug = (description ?? '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const safeDescription = sanitizeSegment(descSlug || 'no-description');

  return (
    tpl
      .replace(/{n}/g, numPadded)
      .replace(/{category}/g, safeCategory)
      .replace(/{date}/g, `${d}-${m}-${y}`)
      .replace(/{datetime}/g, `${d}-${m}-${y}_${hh}-${min}`)
      .replace(/{description}/g, safeDescription) + '.jpeg'
  );
}
