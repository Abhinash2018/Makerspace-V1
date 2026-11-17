import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/capacity/**/*.test.ts'], maxWorkers: 1, fileParallelism: false, testTimeout: 180000 } });
