import { createError, defineEventHandler, getRouterParam } from 'h3'
import useLogger from '../../../composables/useLogger'
import { getStereoPairs, removeStereoPair } from '../../../lib/hubConfig'
import { dissolveStereoPair } from '../../../lib/stereoPair'

/**
 * Dissolves the stereo pair of the given left player: both players are unsynced and output stereo again.
 */
export default defineEventHandler(async (event) => {
  const logger = useLogger('pairs.delete')
  const leftId = decodeURIComponent(getRouterParam(event, 'leftId') ?? '')

  const pair = (await getStereoPairs()).find((candidate) => candidate.leftId === leftId)
  if (!pair) {
    throw createError({ statusCode: 404, statusMessage: `Stereo pair of player '${leftId}' not found` })
  }

  await dissolveStereoPair(pair.leftId, pair.rightId)
  try {
    await removeStereoPair(leftId)
  } catch (error) {
    logger.error(`Failed to remove stereo pair '${pair.name}':`, error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to save settings, check that the config directory is writable' })
  }
  logger.info(`Stereo pair '${pair.name}' dissolved`)
  return { removed: true }
})
