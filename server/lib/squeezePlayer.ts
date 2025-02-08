import { SqueezePlayer, SqueezeServerStub } from 'lms-squeeze-rpc'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

class ExtendedSqueezePlayer extends SqueezePlayer {
  private stub: SqueezeServerStub
  private id: string

  constructor(stub: SqueezeServerStub, playerInfo: IPlayerInfo) {
    super(stub, playerInfo);
    this.stub = stub;
    this.id = playerInfo.playerid;
  }

  async addToPlaylist(trackUrl: string, title: string) {
    return this.stub.requestAsync([this.id, ['playlist', 'add', trackUrl, title]]) //  playlist add <item> <title>
  }

  async clearPlaylist() {
    return this.stub.requestAsync([this.id, ['playlist', 'clear']])
  }

  async selectTrackInPlaylist(index: number) {
    return this.stub.requestAsync([this.id, ['playlist', 'index', index]])
  }

  async play() {
    return this.stub.requestAsync([this.id, ['play', '5']]) // play <fadeInSecs>
  }

  async stop() {
    return this.stub.requestAsync([this.id, ['stop']])
  }
}

export default ExtendedSqueezePlayer
