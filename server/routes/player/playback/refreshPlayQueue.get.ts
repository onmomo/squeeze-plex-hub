import type { PlayerPlayQueue, Track } from '../../../lib/plexPlayerTimeline'
import useLogger from '../../../composables/useLogger'
import { getRequestHeader, getQuery, eventHandler, setResponseHeaders, sendNoContent } from 'h3'
import usePlayerInfo from '../../../composables/usePlayerInfo'
import useSqueezePlayer from '../../../composables/useSqueezePlayer'
import { getPlayQueue, getPlexApiTrack, metadata, responseHeaders } from '../../../lib/plexApi'
import type { PlayerStatus } from '~~/server/lib/squeezePlayer'
import type ExtendedSqueezePlayer from '~~/server/lib/squeezePlayer'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

const logger = useLogger('playback.refreshPlayQueue')

/**
 * This will create a play queue on plex server and play it on the target player.
 */
export default eventHandler(async (event) => {
  const storage = useStorage('DISCOVERY')
  const query = getQuery(event)
  const targetClientIdentifier = getRequestHeader(event, 'X-Plex-Target-Client-Identifier')
  const clientIdentifier = getRequestHeader(event, 'X-Plex-Client-Identifier')
  const deviceName = getRequestHeader(event, 'X-Plex-Device-Name')
  const playQueueID = query.playQueueID as string

  if (!targetClientIdentifier || !clientIdentifier || !deviceName || !playQueueID) {
    logger.warn(
      `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) and playQueueID query parameter, got:`,
      event.node.req.headers
    )
    return event.respondWith(
      new Response(
        `Missing required parameters ('X-Plex-Target-Client-Identifier', 'X-Plex-Client-Identifier', 'X-Plex-Device-Name' headers) in request`,
        { status: 400 }
      )
    )
  }

  const lockKey = `refreshPlayQueueLock/${targetClientIdentifier}`
  // Try to acquire lock
  const lock = await storage.getItem(lockKey)
  if (lock) {
    // Mark that a refresh was requested while the lock was held
    await storage.setItem(`${lockKey}/pending`, true)
    logger.warn(`Refresh play queue already in progress for player '${targetClientIdentifier}', skipping concurrent request.`)
    return event.respondWith(
      new Response(`Refresh play queue already in progress for player '${targetClientIdentifier}', try again later`, { status: 400 })
    )
  }
  await storage.setItem(lockKey, Date.now())

  try {
    const { playerInfo } = await usePlayerInfo(targetClientIdentifier)
    const { player } = await useSqueezePlayer(targetClientIdentifier)
    logger.info(`Refreshing playQueue '${playQueueID}' for player '${playerInfo.name}' ..`)
    const playerQueue = (await storage.getItem<PlayerPlayQueue>(`playerQueue/${playerInfo.playerid}`)) ?? undefined
    if (!playerQueue) {
      throw new Error(`No playerQueue available for player ${playerInfo.name} (${playerInfo.playerid}), skipping playQueue refresh ..`)
    }
    const loadedTracks = playerQueue.playQueue.MediaContainer.Track ?? []
    logger.info(`Loaded playQueue has ${loadedTracks.length} tracks`)

    const refreshedPlayQueue = await getPlayQueue(playerQueue.plexServer, `/playQueues/${playQueueID}`)
    const refreshedPlayerQueue: PlayerPlayQueue = {
      playerId: playerInfo.playerid,
      playQueue: refreshedPlayQueue,
      plexServer: playerQueue.plexServer
    }
    const refreshedTracks = refreshedPlayerQueue.playQueue.MediaContainer.Track ?? []
    logger.info(`Refreshed playQueue has ${refreshedTracks.length} tracks`)

    const playerStatus = await player.status()
    if (!playerStatus) {
      throw new Error(`Could not get status from player '${playerInfo.name}', cannot refresh play queue`)
    }

    const currentTrackUrl = playerStatus.remoteMeta?.url

    // Deleting of all the upcoming tracks is necessary if the user moved tracks around in the upcoming tracks to play in the playlist
    await syncPlaylistWithRefresh(playerStatus, player, playerInfo, loadedTracks, refreshedTracks)
    const currentTrackIndex = refreshedTracks.findIndex((t) => currentTrackUrl?.includes(t?.Media[0]?.Part[0]?.$.key))
    if (currentTrackIndex === -1) {
      logger.warn(`Could not find currently loaded track in refreshedTracks by remoteMeta.url (${currentTrackUrl})`)
    }

    logger.info(`Current track in refreshed play queue is at index ${currentTrackIndex}, getting all tracks after to add to playlist ..`)
    // Add all tracks in refreshedTracks that come after the current track
    const tracksToAdd = currentTrackIndex !== -1 ? refreshedTracks.slice(currentTrackIndex + 1) : []
    logger.debug(`Tracks to queue from refreshed play queue after current track: ${JSON.stringify(tracksToAdd.map((t) => t.$.title))}`)
    for (const track of tracksToAdd) {
      logger.info(`Adding track '${track.$.title}' to refreshed playQueue for player '${playerInfo.name}' ..`)
      const trackUrl = getPlexApiTrack(playerQueue.plexServer, track)
      await player.addToPlaylist(trackUrl, metadata(track))
    }

    await storage.setItem(`playerQueue/${playerInfo.playerid}`, refreshedPlayerQueue)
    setResponseHeaders(event, Object.fromEntries(responseHeaders(playerInfo.playerid, playerInfo.name).entries()))
    return sendNoContent(event, 200)
  } catch (error) {
    logger.warn(`Error when refreshing play queue for player '${targetClientIdentifier}'`, error)
    return event.respondWith(
      new Response(`Player '${targetClientIdentifier}' failed to refresh play queue, try again later`, { status: 404 })
    )
  } finally {
    await storage.removeItem(lockKey)
    // After releasing the lock, check if a pending refresh was requested
    // (Place this inside the finally block, after removing the lock)
    const pendingRefresh = await storage.getItem(`${lockKey}/pending`)
    if (pendingRefresh) {
      await storage.removeItem(`${lockKey}/pending`)
      logger.info(`Pending refresh detected for player '${targetClientIdentifier}', refreshing again ..`)
      //  eventHandler(event)
    }

    logger.info(`Finished refreshing play queue for player '${targetClientIdentifier}'`)
  }

  /**
   * Synchronizes the player's playlist with the refreshed track list on LMS.
   */
  async function syncPlaylistWithRefresh(
    playerStatus: PlayerStatus,
    player: ExtendedSqueezePlayer,
    playerInfo: IPlayerInfo,
    loadedTracks: Track[],
    refreshedTracks: Track[]
  ) {
    const currentPlaylistIndex = playerStatus.playlist_cur_index
    const playlistTrackCount = playerStatus.playlist_tracks
    logger.info(
      `Preparing to remove ${playlistTrackCount} tracks from playlist for player '${playerInfo.name}'. Keeping track at index ${currentPlaylistIndex}...`
    )
    // Remove all tracks after currentPlaylistIndex
    for (let i = playlistTrackCount - 1; i > currentPlaylistIndex; i--) {
      await player.deleteTrackFromPlaylist(i)
      logger.info(`Removed track at index '${i}' from playlist for player '${playerInfo.name}'`)
    }
    // Remove tracks before currentPlaylistIndex which are no longer in the refreshed playQueue
    for (let i = currentPlaylistIndex - 1; i >= 0; i--) {
      const trackKey = loadedTracks[i]?.Media[0]?.Part[0]?.$.key
      logger.debug(`Checking if track at index ${i} with key '${trackKey}' still exists in refreshed playQueue`)
      const stillExists = refreshedTracks.some((t) => t?.Media[0]?.Part[0]?.$.key === trackKey)
      if (!stillExists) {
        await player.deleteTrackFromPlaylist(i)
        logger.info(
          `Removed track at index '${i}' with key '${trackKey}' from playlist for player '${playerInfo.name}' (no longer exists in refreshed playQueue)`
        )
      }
    }
  }
})
