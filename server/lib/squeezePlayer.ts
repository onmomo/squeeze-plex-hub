import { SqueezePlayer, SqueezeServerStub } from 'lms-squeeze-rpc'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

export interface PlayerStatus {
  playerId: string
  mode: string
  time: number
  duration?: number
  playlist_cur_index: number
  playlist_tracks: number
  volume: number
}

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

  async selectTrackInPlaylist(index: string) {
    return this.stub.requestAsync([this.id, ['playlist', 'index', index]])
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
        volume: Number.parseInt(response['mixer volume']) || 0        
      }

      return status
    }

    return undefined
  }
}

export default ExtendedSqueezePlayer
