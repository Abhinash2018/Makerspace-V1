import { defineConfig } from 'vitest/config';
// PDF/native-worker and scrypt tests have real heap/CPU budgets. Keep file-level
// parallelism bounded; explicit concurrency tests still start independent workers.
export default defineConfig({ test: { include: ['packages/**/*.test.ts', 'services/**/*.test.ts', 'scripts/**/*.test.ts'], maxWorkers: 4, testTimeout: 15000 } });
