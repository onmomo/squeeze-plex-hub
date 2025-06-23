import axios from 'axios'
import { parseStringPromise } from 'xml2js'
import * as plexApi from './plexApi'
import type { Track, PlayQueue } from './plexPlayerTimeline'
import { describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('axios')
vi.mock('xml2js', () => ({
  parseStringPromise: vi.fn()
}))

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    warn: vi.fn()
  })
}))

const mockPlexServer: plexApi.PlexServer = {
  server: {
    protocol: 'http',
    localAddress: '127.0.0.1',
    port: 32400
  } as any,
  token: 'token123'
}

const mockTrack: Track = {
  $: {
    grandparentTitle: 'Artist',
    parentTitle: 'Album',
    title: 'Song'
  },
  Media: [
    {
      Part: [
        {
          $: { key: '/library/parts/1/file.mp3' }
        }
      ]
    }
  ]
} as any

describe('plexApi', () => {
  describe('responseHeaders', () => {
    it('should return headers with correct values', () => {
      const headers = plexApi.responseHeaders('pid', 'pname', 'application/json')
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('X-Plex-Client-Identifier')).toBe('pid')
      expect(headers.get('X-Plex-Device-Name')).toBe('pname')
    })
  })

  describe('getPlexApi', () => {
    it('should build the correct API URL', () => {
      const url = plexApi.getPlexApi(mockPlexServer, '/foo')
      expect(url).toBe('http://127.0.0.1:32400/foo')
    })
  })

  describe('getPlexApiTrack', () => {
    it('should build the correct track URL', () => {
      const url = plexApi.getPlexApiTrack(mockPlexServer, mockTrack)
      expect(url).toBe('http://127.0.0.1:32400/library/parts/1/file.mp3?X-Plex-Token=token123')
    })
  })

  describe('metadata', () => {
    it('should return formatted metadata string', () => {
      const meta = plexApi.metadata(mockTrack)
      expect(meta).toBe('Artist - Song (Album)')
    })
  })

  describe('getPlayQueue', () => {
    it('should fetch and parse playQueue', async () => {
      ;(axios.get as Mock).mockResolvedValue({ data: '<xml></xml>' })
      ;(parseStringPromise as Mock).mockResolvedValue({ PlayQueue: 'parsed' })
      const result = await plexApi.getPlayQueue(mockPlexServer, '/playQueues/123')
      expect(axios.get).toHaveBeenCalledWith('http://127.0.0.1:32400/playQueues/123', expect.any(Object))
      expect(parseStringPromise).toHaveBeenCalledWith('<xml></xml>')
      expect(result).toEqual({ PlayQueue: 'parsed' })
    })

    it('should throw if no data returned', async () => {
      ;(axios.get as Mock).mockResolvedValue({ data: '' })
      await expect(plexApi.getPlayQueue(mockPlexServer, '/playQueues/123')).rejects.toThrow('Failed to fetch playQueue')
    })

    it('should throw on error', async () => {
      ;(axios.get as Mock).mockRejectedValue(new Error('fail'))
      await expect(plexApi.getPlayQueue(mockPlexServer, '/playQueues/123')).rejects.toThrow('Failed to fetch playQueue')
    })
  })
})
