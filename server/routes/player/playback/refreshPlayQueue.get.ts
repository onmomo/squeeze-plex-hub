import useLogger from '~~/server/composables/useLogger'
import { getRequestHeader, getQuery } from 'h3'

// catchAll route triggered: GET /player/playback/refreshPlayQueue?playQueueID=7868&commandID=4400&type=music
const logger = useLogger('playback.refreshPlayQueue')

/**
 * This will create a play queue on plex server and play it on the target player.
 */
export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')

  logger.info(`Refresh play queue for player '${targetClientIdentifier}' ..`)
  logger.info(`Query parameters: ${JSON.stringify(query)}`)
  logger.info(`Headers: ${JSON.stringify(event.node.req.headers)}`)

  if (!targetClientIdentifier || !clientIdentifier || !deviceName) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) in request`,
        { status: 400 }
      )
    )
  }

  try {
    // TODO figure what to do here, how to refresh the playQueue and when is this triggered?
    // This route is triggered by plex app when a track has been added or removed from the playQueue
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when refreshing play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for refreshing play queue, try again later`, { status: 404 })
    )
  }
})
