import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import { plexOptions } from '~/server/lib/squeezePlexHub'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { responseHeaders } from '../lib/plexApi'

const logger = useLogger('resources.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  //const requestPort = getRequestHeader(event, 'X-Forwarded-Port') || event.node.req.socket.localPort
  //logger.info(`Request received on port: ${requestPort}`)


  /**
   * <MediaContainer size="1"><Player machineIdentifier="6a0ceed7-5dda-4fd8-94d2-dc9be45e2c46" deviceClass="pc" platform="macOS" platformVersion="24.1.0" product="Plexamp" protocol="plex" protocolVersion="1" protocolCapabilities="timeline,playback,playqueues,playqueues-creation" title="cmo's MacBook Pro" version="4.11.5"/></MediaContainer>
   */

  /**
   * Generates the resources XML based on a set of players.
   */
  function resourcesXml(players: IPlayerInfo[]): string {
    const mediaContainer = {
      // TODO fix for plex web player, each player has to be exposed on a different port otherwise plex web will only show one player
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
            protocol: plexOptions.protocol,
            protocolVersion: plexOptions.protocolVersion,
            model: plexOptions.model,
            device: plexOptions.device,
            protocolCapabilities: plexOptions.protocolCapabilities,            
            deviceClass: plexOptions.deviceClass
          }
        }))
      }
    }

    const builder = new Builder()
    return builder.buildObject(mediaContainer)
  }

  try {
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

      // Only return the player that matches the targetClientIdentifier
       const player = allPlayers.find((p) => p.playerid === targetClientIdentifier)
       if (!player) {
         logger.warn(`Player '${targetClientIdentifier}' not found in storage for /resources`)
         return resourcesXml([])
       }

      setResponseHeaders(event, Object.fromEntries(responseHeaders(player.playerid, player.name, 'text/xml').entries()))
      logger.info(`Responding with '${player.name}' player to /resources consumer ..`)
      //const playerPort = await storage.get<number>(`playerPorts/${player.playerid}`) || Number.parseInt(plexOptions.port)      
      // TODO refactor to single player instead of array of players
      return resourcesXml([player])
    })

    event.respondWith(new Response(xmlResponse, { status: 200 }))
  } catch (error) {
    logger.error('Error generating resources XML:', error)
    return sendNoContent(event, 404)
  }
})
