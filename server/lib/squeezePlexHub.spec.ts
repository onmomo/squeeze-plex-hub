import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { plexOptions, resolveNuxtServerPort } from './squeezePlexHub'

describe('squeezePlexHub', () => {
  const originalEnv = {
    NITRO_PORT: process.env.NITRO_PORT,
    PORT: process.env.PORT
  }

  beforeEach(() => {
    delete process.env.NITRO_PORT
    delete process.env.PORT
  })

  afterEach(() => {
    process.env.NITRO_PORT = originalEnv.NITRO_PORT
    process.env.PORT = originalEnv.PORT
  })

  it('prefers NITRO_PORT when set', () => {
    process.env.NITRO_PORT = '3100'
    process.env.PORT = '3200'

    expect(resolveNuxtServerPort()).toBe('3100')
    expect(plexOptions.port).toBe('3100')
  })

  it('falls back to PORT when NITRO_PORT is not set', () => {
    process.env.PORT = '3200'

    expect(resolveNuxtServerPort()).toBe('3200')
  })

  it('falls back to 3000 when all candidates are missing or invalid', () => {
    process.env.NITRO_PORT = 'abc'
    process.env.PORT = '-1'

    expect(resolveNuxtServerPort()).toBe('3000')
  })
})
