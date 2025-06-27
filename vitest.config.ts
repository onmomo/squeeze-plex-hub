import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['setup-nitro-test-env.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],
    coverage: {
      include: ['components/**', 'pages/**', 'server/**']
    }
  }
})
