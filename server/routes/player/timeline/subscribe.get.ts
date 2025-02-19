import useLogger from '~/server/composables/useLogger'
import type { RemoteSubscriber } from './poll.get'
import { subscriberUrl } from '~/server/lib/plexPayerTimeline'

const logger = useLogger('timeline.subscribe.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)

  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  const plexToken = getRequestHeader(event, 'X-Plex-Token')
  const remoteHost = getRequestHeader(event, 'X-Forwarded-Host') // TODO check if this is the correct header

  const clientIP = getRequestIP(event)  
  
  const plexPort = query.port as string | undefined
  const plexProtocol = query.protocol as string | undefined

  let commandId = query.commandID !== undefined ? parseInt(query.commandID as string) : undefined

  if (
    !targetClientIdentifier ||
    !clientIdentifier ||
    !deviceName ||
    !clientIP ||
    !plexProtocol ||
    !plexPort ||
    commandId === undefined ||
    !deviceName ||
    !plexToken ||
    !remoteHost
  ) {
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
    address: subscriberUrl(plexProtocol, `${clientIP}:${plexPort}`),
    plexToken,
    commandId,
    poll: false,
    targetClientIdentifier,
    subscribedAt: new Date(),
    plexServer: { // TODO improve dirty host url parsing
      host: remoteHost,
      port: plexPort,
      protocol: plexProtocol,
      token: plexToken,
      }
  }
  await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
  logger.info(`Client ${clientIdentifier} subscribed to player ${targetClientIdentifier}`)

  sendNoContent(event, 200)
})
