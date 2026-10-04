import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { addPendingResets, getStereoPairs, removeStereoPair } from '../../../lib/hubConfig'
import { dissolveStereoPair } from '../../../lib/stereoPair'
import pairsDeleteHandler from './[leftId].delete'

vi.mock('../../../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../../../lib/hubConfig', () => ({ getStereoPairs: vi.fn(), removeStereoPair: vi.fn(), addPendingResets: vi.fn() }))
vi.mock('../../../lib/stereoPair', () => ({
  dissolveStereoPair: vi.fn(),
  withPairLock: async (_id: string, change: () => Promise<unknown>) => change()
}))

const event = (id: string) => ({ __is_event__: true, node: { req: { headers: {} } }, context: { params: { leftId: id } } }) as any

describe('DELETE /api/pairs/:leftId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(removeStereoPair as Mock).mockResolvedValue(undefined)
    ;(dissolveStereoPair as Mock).mockResolvedValue([])
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
  })

  it('dissolves the pair and removes it from the settings', async () => {
    expect(await pairsDeleteHandler(event('aa'))).toEqual({ removed: true })
    expect(dissolveStereoPair).toHaveBeenCalledWith('aa', 'bb')
    expect(removeStereoPair).toHaveBeenCalledWith('aa')
  })

  it('remembers members that were unreachable so they are reset later', async () => {
    ;(dissolveStereoPair as Mock).mockResolvedValue(['bb'])
    await pairsDeleteHandler(event('aa'))
    expect(addPendingResets).toHaveBeenCalledWith(['bb'])
    expect(removeStereoPair).toHaveBeenCalledWith('aa')
  })

  it('only removes the pair in demo mode', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ demo: true }))
    try {
      expect(await pairsDeleteHandler(event('aa'))).toEqual({ removed: true })
      expect(dissolveStereoPair).not.toHaveBeenCalled()
      expect(removeStereoPair).toHaveBeenCalledWith('aa')
    } finally {
      vi.stubGlobal('useRuntimeConfig', () => ({ appVersion: '1.2.3-test' }))
    }
  })

  it('returns 404 for an unknown pair', async () => {
    await expect(pairsDeleteHandler(event('zz'))).rejects.toMatchObject({ statusCode: 404 })
    expect(dissolveStereoPair).not.toHaveBeenCalled()
  })

  it('returns 500 if the settings cannot be saved', async () => {
    ;(removeStereoPair as Mock).mockRejectedValue(new Error('EACCES'))
    await expect(pairsDeleteHandler(event('aa'))).rejects.toMatchObject({ statusCode: 500 })
  })
})
