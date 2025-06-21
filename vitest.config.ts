import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    reporters: [
      ['junit']
    ],
    outputFile: 'junit-test-report.xml',
  },
})