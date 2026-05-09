import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        // CLI wiring and top-level orchestration — excluded per project convention
        'src/cli/**',
        'src/index.ts',
        // Integration adapters — these require live SDKs/network; tested via LLMClient mock
        'src/analyzer/client.ts',
        'src/analyzer/index.ts',
        // Per-provider client files split from client.ts — same SDK integration boundary
        'src/analyzer/providers/**',
        // Suggest pass — requires live LLM client; same integration boundary as client.ts
        'src/analyzer/suggest.ts',
        // Reporter port, factory and adapters — thin delegation wrappers over tested reporter fns
        'src/reporter/port.ts',
        'src/reporter/factory.ts',
        'src/reporter/adapters/**',
        // Cloud/filesystem adapters — require live backends; integration test territory
        'src/fs/**',
        // XLSX reporter — requires optional exceljs peer dep not installed in CI
        'src/reporter/xlsx.ts',
        // I/O-heavy modules — filesystem + Sharp; integration test territory
        'src/config/index.ts',
        'src/processor/exporter.ts',
        'src/processor/index.ts',
        // Terminal UI — cannot unit test (cliProgress/TTY)
        'src/utils/progress.ts',
        // Type declarations only — no executable lines
        'src/types.ts',
      ],
      thresholds: {
        // Raised after fixture generator + new batch/exif tests landed.
        lines: 75,
        functions: 85,
        branches: 75,
      },
    },
  },
});
