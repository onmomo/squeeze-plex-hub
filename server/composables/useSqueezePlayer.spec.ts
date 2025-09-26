import useSqueezePlayer from './useSqueezePlayer'
import ExtendedSqueezePlayer from '../lib/squeezePlayer'
import usePlayerInfo from './usePlayerInfo'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('~/server/composables/usePlayerInfo', () => ({
  default: vi.fn(async () => ({
    playerInfo: { playerid: '123', name: 'Living Room' }
  }))
}))

describe('useSqueezePlayer', () => {
  const mockPlayerInfo = { id: 'player1', name: 'Test Player' }
  const mockServerStub = { sendCommand: vi.fn() }

  beforeEach(() => {
    ;(usePlayerInfo as Mock).mockResolvedValue({
      playerInfo: mockPlayerInfo,
      serverStub: mockServerStub
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize ExtendedSqueezePlayer with correct arguments', async () => {
    const result = await useSqueezePlayer('player1')
    expect(usePlayerInfo).toHaveBeenCalledWith('player1')
    expect(result.player).toBeInstanceOf(ExtendedSqueezePlayer)
  })

  it('should throw if usePlayerInfo fails', async () => {
    ;(usePlayerInfo as Mock).mockRejectedValue(new Error('Failed'))
    await expect(useSqueezePlayer('badId')).rejects.toThrow('Failed')
  })
})
