import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import replace from '@rollup/plugin-replace'

// nuxt:replace uses rolldown/plugins (Rolldown-native API) which is incompatible
// with vitest's internal Vite 7 EnvironmentPluginContainer. We remove it and
// substitute a standard @rollup/plugin-replace plugin that performs the same
// import.meta.* replacements using the Rollup-compatible API.
const INCOMPATIBLE_PLUGINS = ['nuxt:replace']

const nuxtProject = await defineVitestProject({
  test: {
    name: 'nuxt',
    include: ['**/*.nuxt.spec.ts'],
    environment: 'nuxt'
  }
})

const flatPlugins = ((nuxtProject.plugins as any[]) ?? []).flat().filter(Boolean)
const replacedPlugins = flatPlugins.filter((p) => !INCOMPATIBLE_PLUGINS.includes(p.name))

// Collect import.meta.* values from the resolved define config and inject a
// Rollup-compatible replace plugin in place of the removed nuxt:replace.
const defineConfig_: Record<string, unknown> = (nuxtProject.define as Record<string, unknown>) ?? {}
const importMetaReplacements: Record<string, string> = {}
for (const [key, val] of Object.entries(defineConfig_)) {
  if (key.startsWith('import.meta.')) {
    importMetaReplacements[key] = String(val)
  }
}
replacedPlugins.push(
  replace({
    ...importMetaReplacements,
    preventAssignment: true,
  }) as unknown as (typeof replacedPlugins)[0],
)

nuxtProject.plugins = replacedPlugins

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
      nuxtProject
    ]
  }
})
