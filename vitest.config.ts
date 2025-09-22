import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({  
  test: {    
    environment: 'node',
    setupFiles: ['setup-nitro-test-env.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],    
    coverage: {
      include: ['components/**', 'pages/**', 'server/**']
    }
  }
})
