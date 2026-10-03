import usePlayers from '../composables/usePlayers'
import { isPlayerHidden } from './hubConfig'

/**
 * A device announced to Plex clients via GDM and described by `/resources`.
 *
 * Today every visible squeeze player is its own target. Player groups (e.g. a room or a stereo pair) will become a
 * single target with several `memberIds`: one GDM announcement, one `Resource-Identifier`, while playback commands
 * fan out to the members.
 */
export interface PlexTarget {
  // Resource identifier announced to Plex, the player id for single players
  id: string
  // Name shown in Plexamp
  name: string
  kind: 'player'
  // LMS server the target belongs to
  serverId: string
  // Squeeze player ids controlled by this target
  memberIds: string[]
}

/**
 * Resolves all targets to announce to Plex clients, hidden players are left out.
 *
 * @throws An error if no LMS is found in storage
 */
export async function resolvePlexTargets(): Promise<PlexTarget[]> {
  const players = await usePlayers()
  const targets: PlexTarget[] = []
  for (const { serverId, playerInfo } of players) {
    if (!(await isPlayerHidden(playerInfo.playerid))) {
      targets.push({ id: playerInfo.playerid, name: playerInfo.name, kind: 'player', serverId, memberIds: [playerInfo.playerid] })
    }
  }
  return targets
}

/**
 * Finds the announced target for a Plex resource identifier, undefined if unknown or hidden.
 */
export async function findPlexTarget(id: string): Promise<PlexTarget | undefined> {
  return (await resolvePlexTargets()).find((target) => target.id === id)
}
