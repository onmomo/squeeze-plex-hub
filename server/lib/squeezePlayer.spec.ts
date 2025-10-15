import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import ExtendedSqueezePlayer from './squeezePlayer'
import type { SqueezeServerStub } from 'lms-squeeze-rpc-x'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

const mockPlayerInfo: IPlayerInfo = {
  playerid: 'abc123',
  name: 'Test Player',
  model: 'A-Model',
  modelname: 'Test Model Name',
  firmware: '1.0',
  ip: '1.0.0.127'
}

function createStub() {
  return {
    requestAsync: vi.fn()
  } as unknown as SqueezeServerStub
}

describe('ExtendedSqueezePlayer', () => {
  let stub: SqueezeServerStub
  let player: ExtendedSqueezePlayer

  beforeEach(() => {
    stub = createStub()
    player = new ExtendedSqueezePlayer(stub, mockPlayerInfo)
    vi.clearAllMocks()
  })

  it('calls addToPlaylist with correct args', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('ok')
    const result = await player.addToPlaylist('track.flac', 'Track Title')
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['playlist', 'add', 'track.flac', 'Track Title']])
    expect(result).toBe('ok')
  })

  it('calls clearPlaylist', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('cleared')
    const result = await player.clearPlaylist()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['playlist', 'clear']])
    expect(result).toBe('cleared')
  })

  it('calls selectTrackInPlaylist', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('selected')
    const result = await player.selectTrackInPlaylist(2)
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['playlist', 'index', '2']])
    expect(result).toBe('selected')
  })

  it('calls play', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('playing')
    const result = await player.play()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['play', '5']])
    expect(result).toBe('playing')
  })

  it('calls stop', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('stopped')
    const result = await player.stop()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['stop']])
    expect(result).toBe('stopped')
  })

  it('calls pause', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('paused')
    const result = await player.pause()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['pause']])
    expect(result).toBe('paused')
  })

  it('calls skipNext', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('next')
    const result = await player.skipNext()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['playlist', 'index', '+1']])
    expect(result).toBe('next')
  })

  it('calls skipPrevious', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('prev')
    const result = await player.skipPrevious()
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['playlist', 'index', '-1']])
    expect(result).toBe('prev')
  })

  it('calls seekTo', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue('seeked')
    const result = await player.seekTo(42)
    expect(stub.requestAsync).toHaveBeenCalledWith(['abc123', ['time', '42']])
    expect(result).toBe('seeked')
  })

  it('returns status with correct mapping', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue({
      mode: 'play',
      time: '12.5',
      playlist_cur_index: '1',
      playlist_tracks: '10',
      duration: '180.0',
      'mixer volume': '55'
    })
    const status = await player.status()
    expect(status).toEqual({
      playerId: 'abc123',
      mode: 'play',
      time: 12.5,
      playlist_cur_index: 1,
      playlist_tracks: 10,
      duration: 180.0,
      volume: 55
    })
  })

  it('returns undefined if status response is falsy', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue(undefined)
    const status = await player.status()
    expect(status).toBeUndefined()
  })

  it('handles missing/invalid status fields gracefully', async () => {
    ;(stub.requestAsync as Mock).mockResolvedValue({
      mode: undefined,
      time: undefined,
      playlist_cur_index: undefined,
      playlist_tracks: undefined,
      duration: undefined,
      'mixer volume': undefined
    })
    const status = await player.status()
    expect(status).toEqual({
      playerId: 'abc123',
      mode: undefined,
      time: 0,
      playlist_cur_index: 0,
      playlist_tracks: 0,
      duration: 0,
      volume: 0
    })
  })
})
