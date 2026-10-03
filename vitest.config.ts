import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],
    coverage: {
      include: ['components/**', 'pages/**', 'server/**']
    },
    projects: [
      {
        test: {
          setupFiles: ['setup-nitro-test-env.ts'],
          name: 'unit',
          include: ['**/*.spec.ts'],
          exclude: ['**/*.nuxt.spec.ts', '**/*.e2e.spec.ts', '**/node_modules/**'],
          environment: 'node'
        }
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['**/*.nuxt.spec.ts'],
          environment: 'nuxt'
        }
      })
    ]
  }
})
