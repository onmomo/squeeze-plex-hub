import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('resources.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  /**
   * Generates the resources XML based on a set of players.
   */
  function resourcesXml(players: IPlayerInfo[]): string {
    const mediaContainer = {
      MediaContainer: {
        $: {
          size: players.length
        },
        Player: [...players].map((boundPlayer) => ({
          $: {
            machineIdentifier: boundPlayer.playerid,
            title: boundPlayer.name,
            platform: plexOptions.platform,
            platformVersion: plexOptions.platformVersion,
            product: plexOptions.product,
            version: plexOptions.version,
            protocol: 'plex',
            protocolVersion: '1',
            protocolCapabilities: 'timeline,playback,playqueues,playqueues-creation',
            port: plexOptions.port,
            deviceClass: plexOptions.deviceClass
          }
        }))
      }
    }

    const builder = new Builder()
    return builder.buildObject(mediaContainer)
  }

  const xmlResponse = await storage.getKeys('players/').then(async (serverKey) => {
    if (!serverKey) {
      logger.debug('No LMS found in storage, skipping')
      return resourcesXml([])
    }

    const allPlayers: IPlayerInfo[] = []
    for (const key of serverKey) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      allPlayers.push(...(playerInfos || []))
    }

    logger.info(`Responding with ${allPlayers.length} players to /resources api caller ..`)
    return resourcesXml(allPlayers)
  })

  event.respondWith(new Response(xmlResponse, { status: 200, headers: { 'Content-Type': 'application/xml' } }))
})
