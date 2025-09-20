import { defineVitestConfig } from '@nuxt/test-utils/config'
import vue from '@vitejs/plugin-vue'

export default defineVitestConfig({  
  test: {    
    environment: 'node',
    
    setupFiles: ['setup-nitro-test-env.ts'],
    reporters: ['default', ['junit', { outputFile: 'test-report.junit.xml' }]],    
    coverage: {
      include: ['components/**', 'server/**']
    }
  }
})
