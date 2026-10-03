import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { getStereoPairs, removeStereoPair } from '../../../lib/hubConfig'
import { dissolveStereoPair } from '../../../lib/stereoPair'
import pairsDeleteHandler from './[leftId].delete'

vi.mock('../../../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../../../lib/hubConfig', () => ({ getStereoPairs: vi.fn(), removeStereoPair: vi.fn() }))
vi.mock('../../../lib/stereoPair', () => ({ dissolveStereoPair: vi.fn() }))

const event = (id: string) => ({ __is_event__: true, node: { req: { headers: {} } }, context: { params: { leftId: id } } }) as any

describe('DELETE /api/pairs/:leftId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(removeStereoPair as Mock).mockResolvedValue(undefined)
    ;(getStereoPairs as Mock).mockResolvedValue([{ name: 'Kitchen', leftId: 'aa', rightId: 'bb' }])
  })

  it('dissolves the pair and removes it from the settings', async () => {
    expect(await pairsDeleteHandler(event('aa'))).toEqual({ removed: true })
    expect(dissolveStereoPair).toHaveBeenCalledWith('aa', 'bb')
    expect(removeStereoPair).toHaveBeenCalledWith('aa')
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
