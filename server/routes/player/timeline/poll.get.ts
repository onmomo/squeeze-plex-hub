import useLogger from '~/server/composables/useLogger'
import { Builder } from 'xml2js'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

const logger = useLogger('timeline.poll.get')
const storage = useStorage('DISCOVERY')

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const commandId = query.commandID as string | undefined
  const wait = query.wait as string | undefined

  if (wait === '1') {
    // this parameter seems to indicate that the client does not want to have an quick response?!
    // responsing without a delay would result into a loop with PMS web app and crash
    // plexamp seems to respond in about 1000ms, so let's copy this here
    await new Promise(resolve => setTimeout(resolve, 1000))        
  }

  if (!targetClientIdentifier || !commandId) {
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier' header and 'commandID' query parameter) in poll request`,
        { status: 400 }
      )
    )
  }

  logger.debug(`Polling player ${targetClientIdentifier} status ..: ${JSON.stringify(event.node.req.headers)}`)
  try {
    const serverKeys = await storage.getKeys('players/')
    if (!serverKeys || serverKeys.length === 0) {
      throw new Error('No LMS found in storage, skipping')
    }

    const allPlayers: IPlayerInfo[] = []
    for (const key of serverKeys) {
      const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
      if (playerInfos) allPlayers.push(...playerInfos)
    }

    const player = allPlayers.find((p) => p.playerid === targetClientIdentifier)
    if (!player) {
      throw new Error(`Player not found in storage for polling`)
    }

    const playerPollStatus = resourcesXml(player, commandId)
    // TODO add response headers
    /**
     * X-Plex-Client-Identifier: eaf4503mmckmlavkz2bx4aiu
X-Plex-Content-Compressed-Length: 457
X-Plex-Content-Original-Length: 743
X-Plex-Protocol: 1.0
     */
    return event.respondWith(new Response(playerPollStatus, { status: 200, headers: { 'Content-Type': 'application/xml' } }))
  } catch (error) {
    logger.warn(`Error when polling for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' not available for polling yet, try again later`, { status: 404 })
    )
  }
})

/**
 * <MediaContainer commandID="0" location="navigation">
    <Timeline state="stopped" type="video"/>
    <Timeline address="ss10-0-1-5.d099fb26cfd04a089bfcd4b708291019.plex.direct" audioStreamID="50547" containerKey="/playQueues/7343" controllable="subtitleStream,videoStream,audioStream,shuffle,repeat,stop,playPause,stepBack,seekTo,stepForward,skipNext" duration="370455" key="/library/metadata/38728" machineIdentifier="db8490d1d364f23ae031ccf6f1e4cdd3baeb228e" playQueueID="7343" playQueueItemID="579558" playQueueVersion="2" port="32400" protocol="https" providerIdentifier="com.plexapp.plugins.library" ratingKey="38728" repeat="0" shuffle="1" state="paused" time="2110" type="music"/>
    <Timeline state="stopped" type="photo"/>
</MediaContainer>

 */

/**
 * <MediaContainer commandID="0" location="navigation">
<Timeline state="stopped" type="video" />
<Timeline state="stopped" type="music" />
<Timeline state="stopped" type="photo" />
</MediaContainer>

 */

/**
 * Generates the resources XML based on a set of players.
 */
function resourcesXml(player: IPlayerInfo, commandID: string): string {
  const mediaContainerEmpty = {
    MediaContainer: {
      $: {
        commandID,
        location: 'navigation'
      },
      Timeline: {
        $: {
          type: 'music',
          state: 'stopped'
        }
      }
    }
  }

  const mediaContainer = {
    MediaContainer: {
      $: {
        commandID,
        machineIdentifier: player.playerid,
        location: 'fullScreenMusic',
        size: '3'
      },
      Timeline: [
        {
          $: {
            type: 'music',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'video',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        },
        {
          $: {
            type: 'photo',
            time: '0',
            seekRange: '0-0',
            controllable: 'playPause,stop,skipPrevious,skipNext'
          }
        }
      ]
    }
  }

  const builder = new Builder()
  return builder.buildObject(mediaContainerEmpty)
}
