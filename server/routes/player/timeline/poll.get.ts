import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import { timelineResponse } from '../../../lib/plexPlayerTimeline'
import { type PlexServer, responseHeaders } from '~/server/lib/plexApi'
import { Builder } from 'xml2js'
import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')
const credentials = useStorage('CREDENTIALS')
const config = useRuntimeConfig()

export interface RemoteSubscriber {
  // the client that subscribes to the targetClientIdentifier player
  clientIdentifier: string
  // the device name of the client
  deviceName: string
  // the url of the client
  //address: string
  // the commandId of the timeline request
  commandId: string
  // whether the client subscribed via /timeline/poll or /timeline/subscribe
  poll: boolean
  // the player the client subscribes to
  targetClientIdentifier: string
  // the date when the client subscribed
  subscribedAt: Date
  //plexServer?: PlexServer
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  //const plexToken = getRequestHeader(event, 'X-Plex-Token')
  //const aMethod = getRequestHeader(event, 'access-control-request-headers')
  //logger.info(`access-control-request-headers: ${aMethod}`)

  // "x-forwarded-for":"127.0.0.1","x-forwarded-port":"60570"
  //const clientHost = getRequestHost(event)
  //const clientProtocol = getRequestProtocol(event)

  // Log all values from event.node.req.socket that might contain the client IP and the port to respond to
  // TODO seems like impossible to get the remote control (also /resources) port out of a plexamp player, plexamp also does not seems to support POST /-/timeline request, returns 404
  //logger.info(`remoteAddress: ${remoteAddress}`)
  //logger.info(`remotePort: ${remotePort}`)
  //logger.info(`forwardedProto: ${forwardedProto}`)
  //logger.info(`clientProtocol: ${clientProtocol}`)

  // subscribe case ->
  //const plexPort = query.port as string | undefined
  //const plexToken = query.token as string | undefined

  const queryParameters = {
    type: query.type as string,
    commandId: query.commandID as string | undefined,
    wait: query.wait as string | undefined,
    includeMetadata: query.includeMetadata === '1'
  }

  //logger.info(`Query parameters: ${JSON.stringify(query)}`)

  //logger.info(`Headers: ${JSON.stringify(event.node.req.headers)}`)

  if (!targetClientIdentifier || !clientIdentifier || !deviceName || !queryParameters.commandId) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got: ${targetClientIdentifier}, ${clientIdentifier}, ${deviceName}, ${queryParameters.commandId}`
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  try {
    const builder = new Builder({ headless: true })
    logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      1
      throw new Error('No LMS found in storage, skipping')
    }

    const allPlayers: [string, IPlayerInfo][] = []

    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      const serverId = key.split(':')[1]
      if (playerInfos) {
        for (const player of playerInfos) {
          allPlayers.push([serverId, player])
        }
      }
    }

    const playerServerTuple = allPlayers.find(([_, p]) => p.playerid === targetClientIdentifier)
    if (!playerServerTuple) {
      throw new Error(`Player not found in storage for playMedia`)
    }

    const [serverId, playerInfo] = playerServerTuple

    const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
    if (!serverInfo || !serverInfo.ip) {
      throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
    }

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player ${targetClientIdentifier} status available yet`)
    }

    const subscriber: RemoteSubscriber = {
      clientIdentifier,
      deviceName,
      commandId: queryParameters.commandId,
      poll: true,
      targetClientIdentifier,
      subscribedAt: new Date()
    }

    if (queryParameters.wait === '1') {
      // don't send timeline response immediately, wait for player to change state and send timeline response in timelinePublisher      
      await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
      logger.info(`Client ${clientIdentifier} subscribed to player ${targetClientIdentifier} for polling`)
      await new Promise((resolve) => setTimeout(resolve, 5000)) // TODO try to pass the event to the subscriber and complete the response in timelinePublisher
    }

    const serverResponse = await storage.getItem<PlexServerResponse>(`plexServer`)
    if (!serverResponse) {
      throw new Error(`No plex server found in storage and playQueue not available`)
    }

    const token = (await credentials.getItem<string>('plexToken')) || config.plexToken
    if (!token) {
      logger.warn('No plex token available, abort timeline subscriber update. Please ensure to authenticate Squeeze Plex Hub.')
      throw new Error(`No Plex token found in storage`)
    }

    const plexServer: PlexServer = {
      host: serverResponse.localAddress,
      port: serverResponse.port.toString(),
      protocol: 'http',
      token: token
    }

    //const playQueue = await storage.getItem<PlexPlayQueue>(`playerQueue/${playerInfo.playerid}`)
    const timelineXml = await timelineResponse(playerStatus, subscriber, plexServer, queryParameters.includeMetadata)
    const xmlString = builder.buildObject(timelineXml)
    const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml')
    logger.debug(`Polling player ${targetClientIdentifier}, includeMeta: ${queryParameters.includeMetadata}, timeline: ${xmlString}`)
    return event.respondWith(new Response(xmlString, { status: 200, headers }))
  } catch (error: any) {
    logger.info(`Could not poll player '${targetClientIdentifier}', try again later. Reason: ${error.message}`)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})
