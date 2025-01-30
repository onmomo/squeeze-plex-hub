import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('resources.get')
const storage = useStorage('DISCOVERY')
const serverPort = 3000 // nuxt server port

export default eventHandler(async (event) => {
  /**
   * Generates the resources XML based on a set of players.
   */
  function resourcesXml(players: IPlayerInfo[]): string {
    const mediaContainer = {
      MediaContainer: {
        Player: [...players].map((boundPlayer) => ({
          $: {
            title: boundPlayer.name,
            platform: 'Konvergo',
            platformVersion: '1.0',
            protocol: 'plex',
            product: 'SqueezePlexHub',
            version: '1.0.0', // TODO get version from package.json
            protocolVersion: '1',
            machineIdentifier: boundPlayer.playerid,
            port: serverPort,
            protocolCapabilities: 'playback,timeline,shoutcast',
            provides: 'player,pubsub-player',
            deviceClass: 'sbt'
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
      allPlayers.push(...playerInfos || [])
    }

    logger.info(`Responding with ${allPlayers.length} players to /resources api caller ..`)
    return resourcesXml(allPlayers)
  })

  event.respondWith(new Response(xmlResponse, { status: 200, headers: { 'Content-Type': 'application/xml' } }))
})
