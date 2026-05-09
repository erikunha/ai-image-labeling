import { describe, expect, it } from 'vitest';
import { buildOutputName } from '../../src/processor/exporter.js';

const T = new Date('2024-06-15T12:00:00.000Z').getTime();

describe('buildOutputName', () => {
  it('produces the correct filename format', () => {
    expect(buildOutputName(1, 'kitchen', T, 'UTC')).toBe(
      '001. Photo of kitchen dated 15-06-2024.jpeg',
    );
  });

  it('zero-pads sequence number to 3 digits', () => {
    expect(buildOutputName(42, 'bathroom', T, 'UTC')).toBe(
      '042. Photo of bathroom dated 15-06-2024.jpeg',
    );
  });

  it('replaces underscores with spaces in category name', () => {
    expect(buildOutputName(1, 'living_room', T, 'UTC')).toBe(
      '001. Photo of living room dated 15-06-2024.jpeg',
    );
  });

  it('falls back to "unknown" for an empty category', () => {
    expect(buildOutputName(1, '', T, 'UTC')).toBe('001. Photo of unknown dated 15-06-2024.jpeg');
  });

  it('strips forward slashes from category — no path traversal in output filename', () => {
    const name = buildOutputName(1, '../../etc/passwd', T, 'UTC');
    expect(name).not.toContain('/');
    expect(name).not.toContain('\\');
    // The result is used as a single filename segment joined with path.join(),
    // so dots without a separator cannot cause traversal.
  });

  it('strips backslashes from category — no path traversal on Windows paths', () => {
    const name = buildOutputName(1, 'foo\\bar', T, 'UTC');
    expect(name).not.toContain('\\');
  });

  it('strips null bytes from category', () => {
    const name = buildOutputName(1, 'kitchen\x00evil', T, 'UTC');
    expect(name).not.toContain('\x00');
  });

  it('returns original-basename form when keepOriginalBasename is provided', () => {
    expect(buildOutputName(1, 'kitchen', T, 'UTC', '/some/path/IMG_0042.jpg')).toBe(
      'IMG_0042.jpeg',
    );
  });
});

describe('buildOutputName — filename template', () => {
  it('renders a custom template with {n}, {category}, {date}', () => {
    expect(buildOutputName(3, 'kitchen', T, 'UTC', undefined, '{n}_{category}_{date}')).toBe(
      '003_kitchen_15-06-2024.jpeg',
    );
  });

  it('renders {datetime} token with hours and minutes', () => {
    const result = buildOutputName(1, 'bathroom', T, 'UTC', undefined, '{n}_{datetime}');
    expect(result).toBe('001_15-06-2024_12-00.jpeg');
  });

  it('renders {description} as a slug from the LLM description', () => {
    const result = buildOutputName(
      1,
      'kitchen',
      T,
      'UTC',
      undefined,
      '{n}_{description}',
      'Water damage on ceiling',
    );
    expect(result).toBe('001_water-damage-on-ceiling.jpeg');
  });

  it('falls back to "no-description" when description is empty', () => {
    const result = buildOutputName(1, 'kitchen', T, 'UTC', undefined, '{n}_{description}', '');
    expect(result).toBe('001_no-description.jpeg');
  });

  it('strips path-traversal characters from description slug', () => {
    const result = buildOutputName(
      1,
      'kitchen',
      T,
      'UTC',
      undefined,
      '{n}_{description}',
      '../evil/path',
    );
    expect(result).not.toContain('/');
    expect(result).not.toContain('\\');
    expect(result).not.toContain('..');
  });

  it('ignores the template and uses basename when keepOriginalBasename is provided', () => {
    const result = buildOutputName(1, 'kitchen', T, 'UTC', '/some/IMG_001.jpg', '{n}_{category}');
    expect(result).toBe('IMG_001.jpeg');
  });

  it('repeats {n} multiple times if the template has it twice', () => {
    const result = buildOutputName(7, 'kitchen', T, 'UTC', undefined, '{n}-copy-{n}');
    expect(result).toBe('007-copy-007.jpeg');
  });
});
