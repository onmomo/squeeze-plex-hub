import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

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
          include: ['**/*.spec.ts', '!**/*.nuxt.spec.ts'],
          environment: 'node'
        }
      },
      {
        plugins: [vue()],
        test: {
          name: 'nuxt',
          include: ['**/*.nuxt.spec.ts'],
          environment: 'happy-dom'
        }
      }
    ]
  }
})
