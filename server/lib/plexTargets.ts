import usePlayers from '../composables/usePlayers'
import { getStereoPairs, isPlayerHidden } from './hubConfig'

/**
 * A device announced to Plex clients via GDM and described by `/resources`.
 *
 * Every visible squeeze player is its own target, except the members of a stereo pair: the pair is one target
 * (one GDM announcement, one `Resource-Identifier`) under the id of its left player. LMS syncs the members, so playback
 * commands to the left player apply to both.
 */
export interface PlexTarget {
  // Resource identifier announced to Plex, the player id for single players
  id: string
  // Name shown in Plexamp
  name: string
  kind: 'player' | 'stereoPair'
  // LMS server the target belongs to
  serverId: string
  // Squeeze player ids belonging to this target, the first one receives the playback commands
  memberIds: string[]
}

/** Marks a stereo pair in the name Plexamp shows, so it can be told apart from a single player */
export const STEREO_PAIR_MARK = '⇄'

/**
 * Resolves all targets to announce to Plex clients, hidden players are left out.
 *
 * @throws An error if no LMS is found in storage
 */
export async function resolvePlexTargets(): Promise<PlexTarget[]> {
  const players = await usePlayers()
  const pairs = await getStereoPairs()
  // The right player only disappears behind its pair if the pair is announced, i.e. its left player is known
  const knownIds = new Set(players.map(({ playerInfo }) => playerInfo.playerid))
  const rightIds = new Set(pairs.filter((pair) => knownIds.has(pair.leftId)).map((pair) => pair.rightId))
  const targets: PlexTarget[] = []
  for (const { serverId, playerInfo } of players) {
    const id = playerInfo.playerid
    if (rightIds.has(id) || (await isPlayerHidden(id))) {
      continue
    }
    const pair = pairs.find((candidate) => candidate.leftId === id)
    targets.push(
      pair
        ? { id, name: `${pair.name} ${STEREO_PAIR_MARK}`, kind: 'stereoPair', serverId, memberIds: [pair.leftId, pair.rightId] }
        : { id, name: playerInfo.name, kind: 'player', serverId, memberIds: [id] }
    )
  }
  return targets
}

/**
 * Finds the announced target for a Plex resource identifier, undefined if unknown or hidden.
 */
export async function findPlexTarget(id: string): Promise<PlexTarget | undefined> {
  return (await resolvePlexTargets()).find((target) => target.id === id)
}
