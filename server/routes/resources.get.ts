import { defineEventHandler, getRequestHeader, sendNoContent, setResponseHeaders } from 'h3'
import { Builder } from 'xml2js'
import useLogger from '../composables/useLogger'
import { responseHeaders } from '../lib/plexApi'
import { plexOptions } from '../lib/squeezePlexHub'
import { findPlexTarget, type PlexTarget } from '../lib/plexTargets'

export default defineEventHandler(async (event) => {
  const logger = useLogger('resources')
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')

  if (!targetClientIdentifier) {
    logger.warn(`Missing required parameters ('X-Plex-Target-Client-Identifier' header), got:`, event.node.req.headers)
    return event.respondWith(new Response(`Missing required parameters ('X-Plex-Target-Client-Identifier' header)`, { status: 400 }))
  }

  /**
   * Generates the resources XML based on the provided Plex target
   * @param target The announced player to generate the XML for
   * @returns The XML string
   */
  function resourcesXml(target: PlexTarget): string {
    const mediaContainer = {
      MediaContainer: {
        $: {
          size: '1'
        },
        Player: {
          $: {
            machineIdentifier: target.id,
            title: target.name,
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
    const target = await findPlexTarget(targetClientIdentifier)
    if (!target) {
      logger.info(`Player '${targetClientIdentifier}' is unknown or hidden from Plex, not responding to /resources consumer`)
      return sendNoContent(event, 404)
    }

    setResponseHeaders(event, Object.fromEntries(responseHeaders(target.id, target.name, 'text/xml').entries()))
    logger.info(`Responding with player '${target.name}' to /resources consumer ..`)
    const xmlResponse = resourcesXml(target)

    event.respondWith(new Response(xmlResponse, { status: 200, headers: { 'Content-Type': 'text/xml' } }))
  } catch (error) {
    logger.error(`Error generating resources XML for player '${targetClientIdentifier}':`, error)
    return sendNoContent(event, 404)
  }
})
