import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import useLogger from '../../../../composables/useLogger'
import usePlayers from '../../../../composables/usePlayers'
import { setPlayerSettings } from '../../../../lib/hubConfig'

export interface PlayerSettingsUpdate {
  hidden: boolean
}

/**
 * Updates the persisted settings of a squeeze player, e.g. `{ "hidden": true }` hides it from Plex clients.
 */
export default defineEventHandler(async (event) => {
  const logger = useLogger('players.settings.patch')
  const playerId = decodeURIComponent(getRouterParam(event, 'playerId') ?? '')
  const body = await readBody<Partial<PlayerSettingsUpdate> | null>(event)

  if (typeof body?.hidden !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: `Expected a JSON body like { "hidden": true }` })
  }

  const players = await usePlayers().catch(() => [])
  const player = players.find((entry) => entry.playerInfo.playerid === playerId)
  if (!player) {
    throw createError({ statusCode: 404, statusMessage: `Player '${playerId}' not found` })
  }

  try {
    return await setPlayerSettings(playerId, { name: player.playerInfo.name, hidden: body.hidden })
  } catch (error) {
    logger.error(`Failed to save settings for player '${player.playerInfo.name}':`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save settings, check that the config directory is writable' })
  }
})
