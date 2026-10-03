import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest'
import { readBody } from 'h3'
import usePlayers from '../../../../composables/usePlayers'
import { setPlayerSettings } from '../../../../lib/hubConfig'
import settingsPatchHandler from './settings.patch'

vi.mock('../../../../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../../../../composables/usePlayers', () => ({ default: vi.fn() }))
vi.mock('../../../../lib/hubConfig', () => ({ setPlayerSettings: vi.fn() }))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn() }
})

const playerId = '00:04:20:aa:bb:cc'

function createEventMock(id = encodeURIComponent(playerId)) {
  return { __is_event__: true, node: { req: { headers: {} } }, context: { params: { playerId: id } } } as any
}

describe('PATCH /api/players/:playerId/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(usePlayers as Mock).mockResolvedValue([{ serverId: 's1', playerInfo: { playerid: playerId, name: 'Kitchen' } }])
    ;(setPlayerSettings as Mock).mockImplementation(async (_id, settings) => settings)
  })

  it('hides a player', async () => {
    ;(readBody as Mock).mockResolvedValue({ hidden: true })
    const result = await settingsPatchHandler(createEventMock())
    expect(setPlayerSettings).toHaveBeenCalledWith(playerId, { hidden: true })
    expect(result).toEqual({ hidden: true })
  })

  it('rejects a body without boolean hidden flag', async () => {
    ;(readBody as Mock).mockResolvedValue({ hidden: 'yes' })
    await expect(settingsPatchHandler(createEventMock())).rejects.toMatchObject({ statusCode: 400 })
    expect(setPlayerSettings).not.toHaveBeenCalled()
  })

  it('returns 404 for unknown players', async () => {
    ;(readBody as Mock).mockResolvedValue({ hidden: true })
    await expect(settingsPatchHandler(createEventMock('unknown'))).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 404 if no LMS is known yet', async () => {
    ;(readBody as Mock).mockResolvedValue({ hidden: true })
    ;(usePlayers as Mock).mockRejectedValue(new Error('No LMS found in storage, skipping'))
    await expect(settingsPatchHandler(createEventMock())).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns 500 if settings cannot be saved', async () => {
    ;(readBody as Mock).mockResolvedValue({ hidden: true })
    ;(setPlayerSettings as Mock).mockRejectedValue(new Error('EACCES'))
    await expect(settingsPatchHandler(createEventMock())).rejects.toMatchObject({ statusCode: 500 })
  })
})
