import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { readBody } from 'h3'
import usePlayers from '../../composables/usePlayers'
import { findStereoPair, saveStereoPair } from '../../lib/hubConfig'
import { formStereoPair } from '../../lib/stereoPair'
import pairsPostHandler from './pairs.post'

vi.mock('../../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../../composables/usePlayers', () => ({ default: vi.fn() }))
vi.mock('../../lib/hubConfig', () => ({ findStereoPair: vi.fn(), saveStereoPair: vi.fn() }))
vi.mock('../../lib/stereoPair', () => ({ formStereoPair: vi.fn() }))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return { ...actual, readBody: vi.fn() }
})

const event = { __is_event__: true, node: { req: { headers: {} } } } as any
const body = { name: ' Kitchen ', leftId: 'aa', rightId: 'bb' }

describe('POST /api/pairs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(readBody as Mock).mockResolvedValue(body)
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: { playerid: 'aa' } },
      { serverId: 's1', playerInfo: { playerid: 'bb' } }
    ])
    ;(findStereoPair as Mock).mockResolvedValue(undefined)
    ;(formStereoPair as Mock).mockResolvedValue(undefined)
    ;(saveStereoPair as Mock).mockImplementation(async (pair) => pair)
  })

  it('syncs the players and saves the pair', async () => {
    expect(await pairsPostHandler(event)).toEqual({ name: 'Kitchen', leftId: 'aa', rightId: 'bb' })
    expect(formStereoPair).toHaveBeenCalledWith('aa', 'bb')
  })

  it.each([
    ['without name', { leftId: 'aa', rightId: 'bb' }],
    ['with the same player twice', { name: 'x', leftId: 'aa', rightId: 'aa' }]
  ])('rejects a body %s', async (_name, invalid) => {
    ;(readBody as Mock).mockResolvedValue(invalid)
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(formStereoPair).not.toHaveBeenCalled()
  })

  it('returns 404 for unknown players', async () => {
    ;(usePlayers as Mock).mockResolvedValue([{ serverId: 's1', playerInfo: { playerid: 'aa' } }])
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects players of different servers', async () => {
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 's1', playerInfo: { playerid: 'aa' } },
      { serverId: 's2', playerInfo: { playerid: 'bb' } }
    ])
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('returns 409 if a player is already in a pair', async () => {
    ;(findStereoPair as Mock).mockResolvedValue({ pair: {}, role: 'left' })
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 409 })
    expect(formStereoPair).not.toHaveBeenCalled()
  })

  it('returns 502 and saves nothing if LMS rejects the sync', async () => {
    ;(formStereoPair as Mock).mockRejectedValue(new Error('boom'))
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 502 })
    expect(saveStereoPair).not.toHaveBeenCalled()
  })

  it('returns 500 if the pair cannot be saved', async () => {
    ;(saveStereoPair as Mock).mockRejectedValue(new Error('EACCES'))
    await expect(pairsPostHandler(event)).rejects.toMatchObject({ statusCode: 500 })
  })
})
