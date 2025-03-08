import useLogger from '~/server/composables/useLogger'
import type { RemoteSubscriber } from './poll.get'

const logger = useLogger('timeline.subscribe.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)

  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  
  
  const queryParameters = {
    type: query.type as string,
    commandId: query.commandID as string | undefined,
    wait: query.wait as string | undefined,
    includeMetadata: query.includeMetadata === '1'
  }

  const plexPort = query.port as string | undefined
  const plexProtocol = query.protocol as string | undefined

  //let commandId = query.commandID !== undefined ? parseInt(query.commandID as string) : undefined

  if (
    !targetClientIdentifier ||
    !clientIdentifier ||
    !deviceName ||    
    !plexProtocol ||
    !plexPort ||
    !queryParameters.commandId ||
    !deviceName    
  ) {
    logger.warn(`Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got:`, event.node.req.headers)
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name', headers and 'commandID', 'port', 'protocol' query parameter) in subscribe request`,
        { status: 400 }
      )
    )
  }

  const subscriber: RemoteSubscriber = {
    clientIdentifier,
    deviceName,    
    commandId: queryParameters.commandId,
    poll: false,
    targetClientIdentifier,
    subscribedAt: new Date()   
  }
  await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
  logger.info(`Client ${clientIdentifier} subscribed to player ${targetClientIdentifier}`)

  sendNoContent(event, 200)
})
