/**
 * Demo mode serves fake LMS servers and players (see `demoData.ts`) and disables all network discovery.
 * Enable it with `NUXT_DEMO=true` (or `yarn dev:demo`) to explore or record the dashboard without real hardware.
 */
export function isDemoMode(): boolean {
  try {
    return useRuntimeConfig().demo === true
  } catch {
    return false
  }
}
