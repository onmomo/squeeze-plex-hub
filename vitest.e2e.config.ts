import { defineConfig } from 'vitest/config'

/**
 * End-to-end tests against a real LMS + squeezelite player running in Docker (see test/e2e).
 * Requires a running Docker daemon, run with `yarn test:e2e`.
 */
export default defineConfig({
  test: {
    name: 'e2e',
    include: ['test/e2e/**/*.e2e.spec.ts'],
    setupFiles: ['setup-nitro-test-env.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 300_000,
    fileParallelism: false
  }
})
