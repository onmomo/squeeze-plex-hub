import { defineEventHandler, getRequestHeader, sendNoContent, setResponseHeaders } from 'h3'
import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import { responseHeaders } from '../lib/plexApi'
import { plexOptions } from '../lib/squeezePlexHub'
import usePlayerInfo from '../composables/usePlayerInfo'

export default defineEventHandler(async (event) => {
  const logger = useLogger('resources')
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')

  if (!targetClientIdentifier) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier' header), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier' header)`,
        { status: 400 }
      )
    )
  }

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
    const xmlResponse = await usePlayerInfo(targetClientIdentifier).then(async ({ playerInfo }) => {      
      setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml').entries()))
      logger.info(`Responding with player '${playerInfo.name}' to /resources consumer ..`)      
      return resourcesXml(playerInfo)
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
