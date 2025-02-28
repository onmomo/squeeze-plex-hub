import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'
import type { PlexPlayQueue } from '../playback/playMedia.get'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import { subscriberUrl, timelineBody } from '../../../lib/plexPlayerTimeline'
import { responseHeaders, type PlexServer } from '~/server/lib/plexApi'
import type { PlexServerResponse } from '~/server/plugins/gdmDiscovery'
import { Builder } from 'xml2js'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')

export interface RemoteSubscriber {
  // the client that subscribes to the targetClientIdentifier player
  clientIdentifier: string
  // the device name of the client
  deviceName: string
  // the url of the client
  //address: string
  // the commandId of the timeline request
  commandId: number
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
  const plexToken = getRequestHeader(event, 'X-Plex-Token')
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

  let commandId = query.commandID !== undefined ? parseInt(query.commandID as string) : undefined
  const wait = query.wait as string | undefined
  const includeMetadata = query.includeMetadata === '1'

  //logger.info(`Query parameters: ${JSON.stringify(query)}`)
  
  //logger.info(`Headers: ${JSON.stringify(event.node.req.headers)}`)

  if (
    !targetClientIdentifier ||
    !clientIdentifier ||
    !deviceName ||
    !commandId    
    // TODO plexamp won't send plexToken!
  ) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter), got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }
  
  const builder = new Builder({ headless: true })
  logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)
  try {
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
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
      //address: subscriberUrl(server.protocol, server.host + ':' + server.port), // TODO resolve plex server from storage if no playQueue is available
      commandId,
      poll: true,
      targetClientIdentifier,
      subscribedAt: new Date(),
      //plexServer: server
    }

    if (wait === '1') {
      // don't send timeline response immediately, wait for player to change state and send timeline response in timelinePublisher
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
      logger.info(`Client ${clientIdentifier} subscribed to player ${targetClientIdentifier} for polling`)
    }

    const playQueue = await storage.getItem<PlexPlayQueue>(`playerQueue/${playerInfo.playerid}`)    
    const timelineXml = timelineBody(playerStatus, subscriber, playQueue, includeMetadata)
    const xmlString = builder.buildObject(timelineXml)
    const headers = responseHeaders(playerInfo.playerid, playerInfo.name, 'text/xml')
    //logger.info(`Polling player ${targetClientIdentifier} status: ${playerPollStatus}`)
    return event.respondWith(new Response(xmlString, { status: 200, headers }))
  } catch (error) {
    logger.warn(`Error when polling for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})
