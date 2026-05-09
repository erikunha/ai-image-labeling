---
applyTo: 'src/processor/**'
---

# Processor module — Copilot instructions

## Purpose

This module owns all Sharp image processing. It must never import OpenAI.

## Key invariants

- Output format: JPEG, `quality: 100`, `chromaSubsampling: '4:4:4'`, `mozjpeg: false`
- Always call `.withMetadata()` to preserve EXIF data
- Timestamp overlay: red, bold Arial, centered horizontally, 3% gap from bottom
- Font size: `calculateFontSize(height)` — base ratio 3.5%, XL boost ×1.4, Large boost ×1.25, clamped 56–320px
- `payment_receipt` and `conversation_screenshot` skip overlay — JPEG conversion only
- Dry-run mode: log with `logger.verbose()`, write nothing to disk

## Pure functions (overlay.ts)

`calculateFontSize`, `formatTimestamp`, `buildTimestampSvg`, `calculateOverlayPosition` are pure —
no I/O, fully testable without mocks. Keep them that way.

## Output filename format

```
NNN. Photo of category name dated DD-MM-YYYY.jpeg
```

Numbers are zero-padded to 3 digits. Category underscores are replaced with spaces.
