import useLogger from '~/server/composables/useLogger'
import { Builder } from 'xml2js'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const commandId = query.commandID as string | undefined

  if (!targetClientIdentifier || !commandId) {
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier' header and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)
  try {
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      throw new Error('No LMS found in storage, skipping')
    }

    const allPlayers: IPlayerInfo[] = []
    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      if (playerInfos) allPlayers.push(...playerInfos)
    }

    const player = allPlayers.find((p) => p.playerid === targetClientIdentifier)
    if (!player) {
      throw new Error(`Player not found in storage for polling`)
    }

    const playerPollStatus = resourcesXml(player, commandId)
    return event.respondWith(new Response(playerPollStatus, { status: 200, headers: { 'Content-Type': 'application/xml' } }))
  } catch (error) {
    logger.warn(`Error when polling for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})

/**
 * Generates the resources XML based on a set of players.
 */
function resourcesXml(player: IPlayerInfo, commandID: string): string {
  const mediaContainer = {
    MediaContainer: {
      $: {
        commandID,
        machineIdentifier: player.playerid,
        location: 'fullScreenMusic',
        size: '3'
      },
      Timeline: [
        {
          $: {
            type: 'music',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'video',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'photo',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        }
      ]
    }
  }

  const builder = new Builder()
  return builder.buildObject(mediaContainer)
}
