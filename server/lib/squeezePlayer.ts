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

  async addToPlaylist(trackUrl: string, metadata: string) {
    await this.stub.requestAsync([this.id, ['playlist', 'add', trackUrl, metadata]])
  }

  async clearPlaylist() {
    await this.stub.requestAsync([this.id, ['playlist', 'clear']])
  }
}

export default ExtendedSqueezePlayer
