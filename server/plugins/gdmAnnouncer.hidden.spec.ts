import dgram from 'dgram'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import { sendNoContent } from 'h3'
import usePlayers from '../composables/usePlayers'
import { isPlayerHidden } from '../lib/hubConfig'
import resourcesHandler from '../routes/resources.get'
import { runGdmAnnouncer } from './gdmAnnouncer'

// Uses the real plexTargets resolution, only discovery storage and the persisted settings are mocked
vi.mock('../composables/useLogger', () => ({
  default: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../composables/usePlayers', () => ({ default: vi.fn() }))
vi.mock('../lib/hubConfig', () => ({ isPlayerHidden: vi.fn() }))
vi.mock('h3', async () => ({ ...(await vi.importActual<typeof import('h3')>('h3')), sendNoContent: vi.fn() }))

const kitchen = { playerid: '00:04:20:2a:11:02', name: 'Kitchen' } as IPlayerInfo
const office = { playerid: 'b8:27:eb:5c:0f:03', name: 'Office' } as IPlayerInfo

describe('hidden players', () => {
  let server: any
  let messageHandler: any

  beforeEach(() => {
    server = {
      on: vi.fn((event, cb) => {
        if (event === 'message') messageHandler = cb
      }),
      send: vi.fn(),
      bind: vi.fn()
    }
    vi.spyOn(dgram, 'createSocket').mockReturnValue(server)
    ;(usePlayers as Mock).mockResolvedValue([
      { serverId: 'lms-1', playerInfo: kitchen },
      { serverId: 'lms-1', playerInfo: office }
    ])
    ;(isPlayerHidden as Mock).mockImplementation(async (id: string) => id === office.playerid)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('are not advertised to Plex clients via GDM', async () => {
    runGdmAnnouncer()
    await messageHandler(Buffer.from('M-SEARCH * HTTP/1.1'), { address: '1.2.3.4', port: 12345 })

    const messages: string[] = server.send.mock.calls.map((call: unknown[]) => call[0])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain(`Resource-Identifier: ${kitchen.playerid}\r\n`)
    expect(messages.join()).not.toContain(office.playerid)
    expect(messages.join()).not.toContain(office.name)
  })

  it('are advertised again once visible', async () => {
    ;(isPlayerHidden as Mock).mockResolvedValue(false)
    runGdmAnnouncer()
    await messageHandler(Buffer.from('M-SEARCH * HTTP/1.1'), { address: '1.2.3.4', port: 12345 })

    expect(server.send).toHaveBeenCalledTimes(2)
    expect(server.send.mock.calls.map((call: unknown[]) => call[0]).join()).toContain(`Resource-Identifier: ${office.playerid}\r\n`)
  })

  it('are not described to Plex clients via /resources', async () => {
    const respondWith = vi.fn()
    const event = (playerId: string) =>
      ({
        __is_event__: true,
        node: { req: { headers: { 'x-plex-target-client-identifier': playerId } }, res: { setHeader: vi.fn() } },
        context: {},
        respondWith
      }) as any

    const hiddenEvent = event(office.playerid)
    await resourcesHandler(hiddenEvent)
    expect(sendNoContent).toHaveBeenCalledWith(hiddenEvent, 404)
    expect(respondWith).not.toHaveBeenCalled()

    await resourcesHandler(event(kitchen.playerid))
    expect(respondWith).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }))
  })
})
