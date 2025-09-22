import { createConfigForNuxt } from '@nuxt/eslint-config'

export default createConfigForNuxt({
  // options here
})
  .prepend(
  )
  // Override some rules in a specific config, based on their name
  .override('nuxt/typescript/rules', {
    rules: {
      // ...Override rules, for example:
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  })

