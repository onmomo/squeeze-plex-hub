import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { responseHeaders } from '../lib/plexApi'

const logger = useLogger('resources')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')

  /**
   * Generates the resources XML based on the provided player
   * @param player The player to generate the XML for
   * @returns The XML string
   */
  function resourcesXml(player: IPlayerInfo): string {
    const mediaContainer = {      
      MediaContainer: {
        $: {
          size: '1'
        },
        Player: {
          $: {
            machineIdentifier: player.playerid,
            title: player.name,
            platform: plexOptions.platform,
            platformVersion: plexOptions.platformVersion,
            product: plexOptions.product,
            version: plexOptions.version,
            protocol: plexOptions.protocol,
            protocolVersion: plexOptions.protocolVersion,
            model: plexOptions.model,
            device: plexOptions.device,
            protocolCapabilities: plexOptions.protocolCapabilities,
            deviceClass: plexOptions.deviceClass
          }
        }
      }
    }

    const builder = new Builder()
    return builder.buildObject(mediaContainer)
  }

  try {
    const xmlResponse = await storage.getKeys('players/').then(async (serverKey) => {
      if (!serverKey) {
        logger.debug('No LMS found in storage, skipping')
        return undefined
      }

      const allPlayers: IPlayerInfo[] = []
      for (const key of serverKey) {
        const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
        allPlayers.push(...(playerInfos || []))
      }

      // Only return the player that matches the targetClientIdentifier
      const player = allPlayers.find((p) => p.playerid === targetClientIdentifier)
      if (!player) {
        logger.debug(`Player '${targetClientIdentifier}' not available yet for /resources consumer`)
        return undefined
      }

      setResponseHeaders(event, Object.fromEntries(responseHeaders(player.playerid, player.name, 'text/xml').entries()))
      logger.info(`Responding with '${player.name}' player to /resources consumer ..`)      
      return resourcesXml(player)
    })

    if (!xmlResponse) {
      return sendNoContent(event, 404)
    }

    event.respondWith(new Response(xmlResponse, { status: 200, headers: { 'Content-Type': 'text/xml' } }))
  } catch (error) {
    logger.error(`Error generating resources XML for player '${targetClientIdentifier}':`, error)
    return sendNoContent(event, 404)
  }
})
