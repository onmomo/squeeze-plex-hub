import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDemoMode } from './demoMode'

describe('isDemoMode', () => {
  afterEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({ appVersion: '1.2.3-test' }))
  })

  it('is off by default', () => {
    expect(isDemoMode()).toBe(false)
  })

  it('is on when enabled in the runtime config', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true }))
    expect(isDemoMode()).toBe(true)
  })

  it('is off outside of a Nitro context', () => {
    vi.stubGlobal('useRuntimeConfig', () => {
      throw new Error('nitro app not available')
    })
    expect(isDemoMode()).toBe(false)
  })
})
