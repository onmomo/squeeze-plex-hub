import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoServers } from '../lib/demoData'
import { seedDemoData } from './00.demoMode'

vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

const setItem = vi.fn()
vi.stubGlobal('useStorage', () => ({ setItem }))

describe('demoMode plugin', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('useRuntimeConfig', () => ({ appVersion: '1.2.3-test' }))
  })

  it('does nothing unless demo mode is enabled', async () => {
    await seedDemoData()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('seeds fake servers and players in demo mode', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true }))
    await seedDemoData()
    for (const { server, players } of demoServers) {
      expect(setItem).toHaveBeenCalledWith(`servers/${server.uuid}`, server)
      expect(setItem).toHaveBeenCalledWith(`players/${server.uuid}`, players)
    }
  })

  it('points the demo servers to a real LMS for player images', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true, demoLms: 'localhost:9001' }))
    await seedDemoData()
    for (const { server } of demoServers) {
      expect(setItem).toHaveBeenCalledWith(`servers/${server.uuid}`, { ...server, ip: 'localhost', jsonPort: '9001' })
    }
  })

  it('defaults the image LMS port to 9000', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true, demoLms: 'lyrion.local' }))
    await seedDemoData()
    expect(setItem).toHaveBeenCalledWith(
      `servers/${demoServers[0]!.server.uuid}`,
      expect.objectContaining({ ip: 'lyrion.local', jsonPort: '9000' })
    )
  })
})
