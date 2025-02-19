import useLogger from '~/server/composables/useLogger'
import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'
import type { PlexPlayQueue } from '../playback/playMedia.get'
import { SqueezeServerStub } from 'lms-squeeze-rpc'
import ExtendedSqueezePlayer from '~/server/lib/squeezePlayer'
import type { ServerInfo } from 'lms-discovery'
import { subscriberUrl, timelineBody } from '../../../lib/plexPayerTimeline'
import type { PlexServer } from '~/server/lib/plexApi'
import { plexOptions } from '~/server/lib/squeezePlexHub'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')

export interface RemoteSubscriber {
  // the client that subscribes to the targetClientIdentifier player
  clientIdentifier: string
  // the device name of the client
  deviceName: string
  // the url of the client
  address: string
  plexToken: string
  // the commandId of the timeline request
  commandId: number
  // whether the client subscribed via /timeline/poll or /timeline/subscribe
  poll: boolean
  // the player the client subscribes to
  targetClientIdentifier: string
  // the date when the client subscribed
  subscribedAt: Date
  plexServer: PlexServer
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  const plexToken = getRequestHeader(event, 'X-Plex-Token')
  //const aMethod = getRequestHeader(event, 'access-control-request-headers')
  //logger.info(`access-control-request-headers: ${aMethod}`)

  const clientHost = getRequestHost(event)
  const clientProtocol = getRequestProtocol(event)
  // subscribe case ->
  //const plexPort = query.port as string | undefined
  //const plexToken = query.token as string | undefined

  let commandId = query.commandID !== undefined ? parseInt(query.commandID as string) : undefined
  const wait = query.wait as string | undefined
  const includeMetadata = query.includeMetadata === '1'

  if (
    !targetClientIdentifier ||
    !clientIdentifier ||
    !deviceName ||
    !clientHost ||
    !clientProtocol ||
    commandId === undefined ||
    !deviceName ||
    !plexToken
  ) {
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  if (wait === '1') {
    // don't send timeline response immediately, wait for player to change state
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }

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

    const playQueue = await storage.getItem<PlexPlayQueue>(`playerQueue/${playerInfo.playerid}`)

    const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
    var player = new ExtendedSqueezePlayer(serverStub, playerInfo)
    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Player ${targetClientIdentifier} status available yet`)
    }

    const subscriber: RemoteSubscriber = {
      clientIdentifier,
      deviceName,
      address: subscriberUrl(clientProtocol, clientHost),
      plexToken,
      commandId,
      poll: true,
      targetClientIdentifier,
      subscribedAt: new Date(),
      plexServer: {
        // TODO improve dirty host url parsing
        host: clientHost.replace(/^https?:\/\//, '').split(':')[0],
        port: clientHost.split(':')[1] || '32400',
        protocol: clientHost.includes('https') ? 'https' : 'http',
        token: plexToken
      }
    }
    
    await storage.setItem(`subscribers/${targetClientIdentifier}/${clientIdentifier}`, subscriber)
    logger.info(`Client ${clientIdentifier} subscribed to player ${targetClientIdentifier} for polling`)

    const playerPollStatus = timelineBody(playerStatus, subscriber, playQueue, includeMetadata)
    const headers = new Headers({
      'Content-Type': 'application/xml',
      'X-Plex-Client-Identifier': playerInfo.playerid,
      'X-Plex-Device-Name': playerInfo.name,
      'X-Plex-Product': plexOptions.product,
      'X-Plex-Version': plexOptions.version,
      'X-Plex-Protocol': plexOptions.protocol,
      'X-Plex-Protocol-Version': plexOptions.protocolVersion,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Plex-Client-Identifier',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '1209600'
    })

    return event.respondWith(new Response(playerPollStatus, { status: 200, headers }))
  } catch (error) {
    logger.warn(`Error when polling for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})
