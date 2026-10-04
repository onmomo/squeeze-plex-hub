import { defineEventHandler } from 'h3'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import useLogger from '../../composables/useLogger'
import usePlayerInfo from '../../composables/usePlayerInfo'
import usePlayers from '../../composables/usePlayers'
import {
  playerCapabilitiesKey,
  stereoPairStatusKey,
  type PlayerCapabilities,
  type StereoPairState,
  type StereoPairStatus
} from '../../lib/stereoPair'
import { findStereoPair, getPlayerSettings } from '../../lib/hubConfig'

export type PlayerServerInfo = {
  playerInfo: IPlayerInfo
  serverInfo: ServerInfo
  settings: {
    hidden: boolean
  }
  // Whether the player can be part of a stereo pair, undefined until the scanner checked it
  canPair?: boolean
  // Set if the player is a member of a stereo pair
  pair?: {
    name: string
    role: 'left' | 'right'
    partnerId: string
    leftId: string
    // Last known state, unknown until the scanner checked the pair
    state?: StereoPairState
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
        const membership = await findStereoPair(player.playerInfo.playerid)
        const status = membership && (await useStorage('DISCOVERY').getItem<StereoPairStatus>(stereoPairStatusKey(membership.pair.leftId)))
        return {
          playerInfo: playerResult.playerInfo,
          serverInfo: playerResult.serverInfo,
          settings: { hidden },
          canPair: (await useStorage('DISCOVERY').getItem<PlayerCapabilities>(playerCapabilitiesKey(player.playerInfo.playerid)))
            ?.outputChannels,
          ...(membership && {
            pair: {
              name: membership.pair.name,
              role: membership.role,
              leftId: membership.pair.leftId,
              partnerId: membership.role === 'left' ? membership.pair.rightId : membership.pair.leftId,
              state: status?.state
            }
          })
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
