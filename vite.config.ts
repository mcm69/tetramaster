import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths. The default `/` emits `/assets/index-*.js`, which resolves to the domain
  // root -- correct at `mcm69.github.io/` and broken at `mcm69.github.io/tetramaster/`, because the
  // project page is served from a subpath. `./` works at both, and at a domain served from disk,
  // which is what the layout harness does when it serves `dist/` over HTTP.
  base: './',
  server: { port: 8080, strictPort: true },
  preview: { port: 8080, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', sourcemap: true },
  test: {
    // Two projects: the rules engine must stay DOM-free (PLAN.md §2.2), so core/ai run in a plain
    // Node environment with no DOM shim. UI tests get jsdom.
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/core/**/*.test.ts',
            'tests/ai/**/*.test.ts',
            'tests/game/**/*.test.ts',
            'tests/audio/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/ui/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      // src/main.ts is the entry-point bootstrap: it mounts a canvas and hands off. Its behaviour
      // is "does the game boot", verified by running the app and by `npm run build` — not by
      // asserting on DOM side effects. Waived in STATUS.md → Deviations per PLAN.md §9.2.
      exclude: ['src/main.ts', 'dist/**', 'coverage/**', '**/node_modules/**'],
      skipFull: false,
      // PLAN.md §9.2. These are floors to catch newly-untested code, not a definition of done —
      // rule traceability (npm run rules:audit) is the primary metric.
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
        // perFile on core is deliberately stricter than the aggregate clause in the plan: it
        // subsumes the "five hardest files must individually meet 95/90" requirement rather than
        // special-casing five filenames.
        'src/core/**': { lines: 95, branches: 90, functions: 95, perFile: true },
        'src/ai/**': { lines: 85, branches: 80, functions: 85, perFile: true },
        'src/game/**': { lines: 95, branches: 90, functions: 95, perFile: true },
        // The synthesis half of `src/audio/` is DOM and WebAudio code; only the cue mapping is
        // asserted headlessly, and that is where the mistakes would be.
        'src/audio/**': { lines: 80, branches: 75, functions: 80, perFile: true },
        'src/data/**': { lines: 100, branches: 100, functions: 100, perFile: true },
        'src/ui/**': { lines: 60, branches: 50, functions: 60 },
        'src/render/**': { lines: 60, branches: 50, functions: 60 },
      },
    },
  },
});
