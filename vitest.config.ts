import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [['default'], ['junit']],
    outputFile: 'test-report.junit.xml',
    coverage: {
      exclude: [
        'nuxt.config.ts'
      ]
    }
  }
})
