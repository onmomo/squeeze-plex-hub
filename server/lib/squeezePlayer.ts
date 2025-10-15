import type { SqueezeServerStub } from 'lms-squeeze-rpc-x'
import { SqueezePlayer } from 'lms-squeeze-rpc-x'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

export interface PlayerStatus {
  playerId: string
  mode: string
  time: number
  duration?: number
  playlist_cur_index: number
  playlist_tracks: number
  volume: number,
  /**
   * 0 = off, 1 = repeat current song, 2 = repeat entire playlist
   */
  repeat: number,
  /**
   * 0 = off, 1 = shuffle by song, 2 = shuffle by album
   */
  shuffle: number
}

/**
 * @see https://github.com/elParaguayo/LMS-CLI-Documentation
 */
class ExtendedSqueezePlayer extends SqueezePlayer {
  private stub: SqueezeServerStub
  private id: string

  constructor(stub: SqueezeServerStub, playerInfo: IPlayerInfo) {
    super(stub, playerInfo)
    this.stub = stub
    this.id = playerInfo.playerid
  }

  async addToPlaylist(trackUrl: string, title: string) {
    return this.stub.requestAsync([this.id, ['playlist', 'add', trackUrl, title]]) //  playlist add <item> <title>
  }

  async clearPlaylist() {
    return this.stub.requestAsync([this.id, ['playlist', 'clear']])
  }

  async deleteTrackFromPlaylist(index: number) {
    return this.stub.requestAsync([this.id, ['playlist', 'delete', index.toString()]])
  }

  async deleteFromPlaylist(trackUrl: string) {
    return this.stub.requestAsync([this.id, ['playlist', 'deleteitem', trackUrl]])
  }

  async selectTrackInPlaylist(index: number) {
    return this.stub.requestAsync([this.id, ['playlist', 'index', index.toString()]])
  }

  /**
   * Sets the playlist repeat mode.
   * @param mode 0 = off, 1 = repeat current song, 2 = repeat entire playlist
   */
  async playlistRepeatMode(mode: number) {
    return this.stub.requestAsync([this.id, ['playlist', 'repeat', mode.toString()]])
  }

  async play() {
    return this.stub.requestAsync([this.id, ['play', '5']]) // play <fadeInSecs>
  }

  async stop() {
    return this.stub.requestAsync([this.id, ['stop']])
  }

  async pause() {
    return this.stub.requestAsync([this.id, ['pause']])
  }

  async skipNext() {
    return this.stub.requestAsync([this.id, ['playlist', 'index', '+1']])
  }

  async skipPrevious() {
    return this.stub.requestAsync([this.id, ['playlist', 'index', '-1']])
  }

  /**
   * Seeks to a particular position in a song by specifying a number of seconds to seek to.
   * @param offset track offset in seconds
   */
  async seekTo(offset: number) {
    return this.stub.requestAsync([this.id, ['time', offset.toString()]])
  }

  async status() {
    const response: any = await this.stub.requestAsync([this.id, ['status', '-', 1, 'tags:uo']])
    if (response) {
      const status: PlayerStatus = {
        playerId: this.id,
        mode: response.mode,
        time: Number.parseFloat(response.time) || 0.0,
        playlist_cur_index: Number.parseInt(response.playlist_cur_index) || 0,
        playlist_tracks: Number.parseInt(response.playlist_tracks) || 0,
        duration: Number.parseFloat(response.duration) || 0.0,
        volume: Number.parseInt(response['mixer volume']) || 0,
        repeat: Number.parseInt(response['playlist repeat']) || 0,
        shuffle: Number.parseInt(response['playlist shuffle']) || 0
      }

      return status
    }

    return undefined
  }
}

export default ExtendedSqueezePlayer
