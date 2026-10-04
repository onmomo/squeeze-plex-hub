import { createError, defineEventHandler, readBody } from 'h3'
import useLogger from '../../composables/useLogger'
import usePlayers from '../../composables/usePlayers'
import { addPendingResets, findStereoPair, saveStereoPair, type StereoPair } from '../../lib/hubConfig'
import usePlayerInfo from '../../composables/usePlayerInfo'
import { isDemoMode } from '../../lib/demoMode'
import { dissolveStereoPair, formStereoPair, supportsStereoPair, withPairLock } from '../../lib/stereoPair'

/**
 * Creates a stereo pair of two players of the same LMS, e.g. `{ "name": "Kitchen", "leftId": "<mac>", "rightId": "<mac>" }`.
 * The players get synced and output the left respectively the right channel.
 */
export default defineEventHandler(async (event) => {
  const logger = useLogger('pairs.post')
  const body = await readBody<Partial<StereoPair> | null>(event)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const { leftId, rightId } = body ?? {}

  if (!name || typeof leftId !== 'string' || typeof rightId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: `Expected a JSON body like { "name": "Kitchen", "leftId": "...", "rightId": "..." }`
    })
  }
  if (leftId === rightId) {
    throw createError({ statusCode: 400, statusMessage: 'A stereo pair needs two different players' })
  }

  const players = await usePlayers().catch(() => [])
  const left = players.find((entry) => entry.playerInfo.playerid === leftId)
  const right = players.find((entry) => entry.playerInfo.playerid === rightId)
  if (!left || !right) {
    throw createError({ statusCode: 404, statusMessage: 'Player not found' })
  }
  if (left.serverId !== right.serverId) {
    throw createError({ statusCode: 400, statusMessage: 'Both players of a stereo pair must be on the same Lyrion server' })
  }
  // The demo players are fake, there is no Lyrion to sync them on
  const demo = isDemoMode()
  for (const { playerInfo, serverStub } of demo ? [] : await Promise.all([leftId, rightId].map((id) => usePlayerInfo(id)))) {
    if (!(await supportsStereoPair(serverStub, playerInfo.playerid).catch(() => false))) {
      throw createError({
        statusCode: 400,
        statusMessage: `Player '${playerInfo.name}' cannot output a single channel, Lyrion offers no output channel setting for it`
      })
    }
  }

  return withPairLock(leftId, async () => {
    // Checked while holding the lock, a request that ran before may have paired one of them
    for (const playerId of [leftId, rightId]) {
      if (await findStereoPair(playerId)) {
        throw createError({ statusCode: 409, statusMessage: `Player '${playerId}' is already part of a stereo pair` })
      }
    }

    try {
      if (!demo) await formStereoPair(leftId, rightId)
    } catch (error) {
      logger.error(`Failed to sync players '${leftId}' and '${rightId}' on LMS:`, error)
      throw createError({ statusCode: 502, statusMessage: 'Lyrion did not accept the stereo pair, check that both players are connected' })
    }

    try {
      return await saveStereoPair({ name, leftId, rightId })
    } catch (error) {
      logger.error(`Failed to save stereo pair '${name}':`, error)
      // The pair would be unmanaged: undo it and make sure players that cannot be reached now are reset later
      if (!demo) {
        const failed = await dissolveStereoPair(leftId, rightId)
        try {
          await addPendingResets(failed)
        } catch (saveError) {
          logger.warn('Could not remember the players to reset:', saveError)
        }
      }
      throw createError({ statusCode: 500, statusMessage: 'Failed to save settings, check that the config directory is writable' })
    }
  }, [leftId, rightId])
})
