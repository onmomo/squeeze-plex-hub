import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import useSqueezePlayer from '../composables/useSqueezePlayer'
import { dissolveStereoPair, formStereoPair } from './stereoPair'

vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../composables/useSqueezePlayer', () => ({ default: vi.fn() }))

const calls: string[] = []
const fakePlayer = (id: string) => ({
  unsync: vi.fn(async () => calls.push(`${id}.unsync`)),
  syncTo: vi.fn(async (other: string) => calls.push(`${id}.syncTo(${other})`)),
  setOutputChannels: vi.fn(async (channels: string) => calls.push(`${id}.channels(${channels})`))
})

describe('stereoPair', () => {
  let players: Record<string, ReturnType<typeof fakePlayer>>

  beforeEach(() => {
    calls.length = 0
    players = { aa: fakePlayer('aa'), bb: fakePlayer('bb') }
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => ({ player: players[id] }))
  })

  it('syncs the right player to the left one and sets the output channels', async () => {
    await formStereoPair('aa', 'bb')
    expect(calls).toEqual(['aa.unsync', 'bb.unsync', 'bb.syncTo(aa)', 'aa.channels(left)', 'bb.channels(right)'])
  })

  it('resets both players when dissolving, even if one is unreachable', async () => {
    ;(useSqueezePlayer as Mock).mockImplementation(async (id: string) => {
      if (id === 'aa') throw new Error('offline')
      return { player: players[id] }
    })
    await dissolveStereoPair('aa', 'bb')
    expect(calls).toEqual(['bb.unsync', 'bb.channels(stereo)'])
  })
})
