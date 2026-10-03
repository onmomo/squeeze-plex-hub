import { defineEventHandler } from 'h3'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import useLogger from '../../composables/useLogger'
import usePlayerInfo from '../../composables/usePlayerInfo'
import usePlayers from '../../composables/usePlayers'
import { getPlayerSettings } from '../../lib/hubConfig'

export type PlayerServerInfo = {
  playerInfo: IPlayerInfo
  serverInfo: ServerInfo
  settings: {
    hidden: boolean
  }
}

export default defineEventHandler(async (event) => {
  const logger = useLogger('players.get')

  try {
    const players = await usePlayers()
    const playerServerInfo: PlayerServerInfo[] = await Promise.all(
      players.map(async (player) => {
        const playerResult = await usePlayerInfo(player.playerInfo.playerid)
        const { hidden } = await getPlayerSettings(player.playerInfo.playerid)
        return {
          playerInfo: playerResult.playerInfo,
          serverInfo: playerResult.serverInfo,
          settings: { hidden }
        }
      })
    )

    logger.debug(`Found ${playerServerInfo.length} players`)

    return playerServerInfo.sort((a, b) => a.playerInfo.model.localeCompare(b.playerInfo.model))
  } catch (error) {
    logger.warn('No players found yet, try again later', error)
    return event.respondWith(new Response(`No players found yet, try again later`, { status: 404 }))
  }
})
