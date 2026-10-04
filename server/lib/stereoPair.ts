import useSqueezePlayer from '../composables/useSqueezePlayer'
import type ExtendedSqueezePlayer from './squeezePlayer'
import type { SqueezeServerStub } from 'lms-squeeze-rpc-x'
import useLogger from '../composables/useLogger'
import usePlayerInfo from '../composables/usePlayerInfo'
import { getPendingResets, getStereoPairs, removePendingReset, type StereoPair } from './hubConfig'

/**
 * Syncs two players and sets the left player to output the left channel and the right player the right channel.
 * The left player syncs to the right one, which makes the left player the master of the group (LMS: `A sync B` lets A absorb B):
 * what the left player plays, including its playlist and position, carries on on both. The other way round the idle right
 * player would become the master and the playback would stop. Playback commands to either member apply to both.
 *
 * @throws An error if LMS rejects a command or a player is unknown
 */
export async function formStereoPair(leftId: string, rightId: string) {
  const logger = useLogger('stereoPair')
  const { player: left } = await useSqueezePlayer(leftId)
  const { player: right } = await useSqueezePlayer(rightId)

  try {
    // Leave previous sync groups first, otherwise the players would drag their old group along (no-op for a single player,
    // so a playing left player keeps playing)
    await right.unsync()
    await left.unsync()
    await left.syncTo(rightId)
    await applyPairPrefs(left, right)
    // Both players start at the volume of the left one, from now on they follow each other
    const volume = (await left.status())?.volume
    if (volume !== undefined) await left.setVolume(volume)
  } catch (error) {
    // Do not leave half a pair behind, the former sync groups of the players are not restored
    await dissolveStereoPair(leftId, rightId)
    throw error
  }
  logger.info(`Synced players '${leftId}' (left) and '${rightId}' (right) as stereo pair`)
}

/** Left/right output and linked volumes, which LMS only applies while the players are synced */
async function applyPairPrefs(left: ExtendedSqueezePlayer, right: ExtendedSqueezePlayer) {
  await left.setOutputChannels('left')
  await right.setOutputChannels('right')
  await left.setSyncVolume(true)
  await right.setSyncVolume(true)
}

/**
 * Dissolves the sync group and lets both players output stereo again.
 * The right player leaves first: in LMS the player that stays in the group keeps playing, so the left player (the one Plexamp
 * knows) continues, no matter which of the two was the sync master.
 * Players that are unreachable are skipped, so a pair can always be removed from the hub.
 *
 * @returns the ids of the players that could not be reset or were not connected (LMS may ignore commands for those)
 */
export async function dissolveStereoPair(leftId: string, rightId: string): Promise<string[]> {
  const logger = useLogger('stereoPair')
  const failed: string[] = []
  for (const playerId of [rightId, leftId]) {
    try {
      const { player } = await useSqueezePlayer(playerId)
      const connected = await player.isConnected()
      await player.unsync()
      await player.setOutputChannels('stereo')
      await player.setSyncVolume(false)
      if (!connected) failed.push(playerId)
    } catch (error) {
      logger.warn(`Could not reset player '${playerId}' of the dissolved stereo pair:`, error)
      failed.push(playerId)
    }
  }
  return failed
}

// Pairs (left player id -> member player ids) that are being created or dissolved, the scanner must neither "repair" them
// nor reset their members meanwhile
const busyPairs = new Map<string, string[]>()

/**
 * Runs a change of a stereo pair while the scanner leaves that pair and its members alone.
 */
export async function withPairLock<T>(leftId: string, change: () => Promise<T>, memberIds: string[] = [leftId]): Promise<T> {
  busyPairs.set(leftId, memberIds)
  try {
    return await change()
  } finally {
    busyPairs.delete(leftId)
  }
}

/**
 * Resets the players of dissolved pairs that were unreachable at that time, as soon as they are connected again.
 */
export async function applyPendingResets() {
  const logger = useLogger('stereoPair')
  const pairedIds = new Set((await getStereoPairs()).flatMap((pair) => [pair.leftId, pair.rightId]))
  const busyIds = new Set([...busyPairs.values()].flat())
  for (const playerId of await getPendingResets()) {
    // Being paired right now: the pending reset is dropped when the new pair is saved
    if (busyIds.has(playerId)) continue
    if (pairedIds.has(playerId)) {
      await removePendingReset(playerId)
      continue
    }
    try {
      const { player } = await useSqueezePlayer(playerId)
      if (await player.isConnected()) {
        await player.unsync()
        await player.setOutputChannels('stereo')
        await player.setSyncVolume(false)
        await removePendingReset(playerId)
        logger.info(`Reset player '${playerId}' of a dissolved stereo pair`)
      }
    } catch (error) {
      logger.debug(`Player '${playerId}' of a dissolved stereo pair is still not reachable:`, error)
    }
  }
}

/**
 * `ok`: the pair is synced with its left and right output, `repaired`: the hub had to restore it,
 * `offline`: a member is not connected to LMS (nothing to repair yet), `error`: LMS did not accept the repair.
 */
export type StereoPairState = 'ok' | 'repaired' | 'offline' | 'error'

export interface StereoPairStatus {
  state: StereoPairState
  checkedAt: number
  // Consecutive checks that found a member disconnected, `offline` is only reported after a few
  offlineChecks?: number
}

// LMS reports some players (e.g. Squeezebox Radio) as disconnected for single readings while they keep playing
const OFFLINE_CHECKS_BEFORE_REPORTING = 3

/** Key in the DISCOVERY storage of the last known state of the pair with the given left player */
export const stereoPairStatusKey = (leftId: string) => `pairStatus/${leftId}`

/**
 * Checks that the members of a stereo pair are connected, synced and output left respectively right, and restores that if
 * not (e.g. after an LMS restart, a player reboot or somebody changing the sync group). A pair that is intact is not touched,
 * so playback is never interrupted.
 */
export async function reconcileStereoPair(pair: StereoPair): Promise<StereoPairState> {
  const logger = useLogger('stereoPair')
  try {
    const { serverStub } = await usePlayerInfo(pair.leftId)
    const { player: left } = await useSqueezePlayer(pair.leftId)
    const { player: right } = await useSqueezePlayer(pair.rightId)

    if (!(await left.isConnected()) || !(await right.isConnected())) {
      logger.debug(`A member of stereo pair '${pair.name}' is not connected, skipping`)
      return 'offline'
    }

    const groups: any = await serverStub.requestAsync(['', ['syncgroups', '?']])
    const synced = ((groups?.syncgroups_loop ?? []) as { sync_members?: string }[]).some((group) => {
      const members = (group.sync_members ?? '').split(',')
      return members.includes(pair.leftId) && members.includes(pair.rightId)
    })
    const intact =
      synced &&
      (await left.getOutputChannels()) === 'left' &&
      (await right.getOutputChannels()) === 'right' &&
      (await left.getSyncVolume()) &&
      (await right.getSyncVolume())
    if (intact) {
      return 'ok'
    }

    logger.info(`Stereo pair '${pair.name}' is no longer intact (synced: ${synced}), restoring it ..`)
    if (synced) {
      // Only the prefs are off, the sync group (and its playback) stays as it is
      await applyPairPrefs(left, right)
    } else {
      await formStereoPair(pair.leftId, pair.rightId)
    }
    return 'repaired'
  } catch (error) {
    logger.warn(`Could not check stereo pair '${pair.name}':`, error)
    // Players that are not (yet) known to the hub are offline from its point of view
    return (error as Error)?.message?.startsWith('Player not found') ? 'offline' : 'error'
  }
}

/**
 * Reconciles all stereo pairs and stores their state for the dashboard.
 */
export async function reconcileStereoPairs() {
  const storage = useStorage('DISCOVERY')
  await applyPendingResets()
  for (const pair of await getStereoPairs()) {
    if (busyPairs.has(pair.leftId)) continue
    const key = stereoPairStatusKey(pair.leftId)
    const previous = await storage.getItem<StereoPairStatus>(key)
    const found = await reconcileStereoPair(pair)
    const offlineChecks = found === 'offline' ? (previous?.offlineChecks ?? 0) + 1 : 0
    // A single reading of "disconnected" does not flip the pair, keep what we knew until it persists
    const state = found === 'offline' && previous && offlineChecks < OFFLINE_CHECKS_BEFORE_REPORTING ? previous.state : found
    await storage.setItem<StereoPairStatus>(key, { state, checkedAt: Date.now(), offlineChecks })
  }
}

/** Key in the DISCOVERY storage of what a player can do, written by the players scanner */
export const playerCapabilitiesKey = (playerId: string) => `playerCapabilities/${playerId}`

export interface PlayerCapabilities {
  // The player offers the `outputChannels` pref, required to play only the left or right channel
  outputChannels: boolean
  // When the capabilities were read, a negative answer is checked again after a while
  checkedAt?: number
}

/**
 * Whether a player can be part of a stereo pair. LMS only offers the output channel setting to players that support it
 * (`hasOutputChannels`: the Squeezebox 2 family), a player without it has no such pref.
 */
export async function supportsStereoPair(stub: SqueezeServerStub, playerId: string): Promise<boolean> {
  const response: any = await stub.requestAsync([playerId, ['playerpref', 'outputChannels', '?']])
  return response?._p2 !== undefined && response._p2 !== null && response._p2 !== ''
}
