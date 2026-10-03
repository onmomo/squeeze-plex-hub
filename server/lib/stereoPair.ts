import useSqueezePlayer from '../composables/useSqueezePlayer'
import useLogger from '../composables/useLogger'

/**
 * Syncs two players and sets the left player to output the left channel and the right player the right channel.
 * Syncing the right player to the left one makes the left player the master of the sync group, playback commands to either
 * member apply to both.
 *
 * @throws An error if LMS rejects a command or a player is unknown
 */
export async function formStereoPair(leftId: string, rightId: string) {
  const logger = useLogger('stereoPair')
  const { player: left } = await useSqueezePlayer(leftId)
  const { player: right } = await useSqueezePlayer(rightId)

  // Leave previous sync groups first, otherwise the right player would drag its old group along
  await left.unsync()
  await right.unsync()
  await right.syncTo(leftId)
  await left.setOutputChannels('left')
  await right.setOutputChannels('right')
  logger.info(`Synced players '${leftId}' (left) and '${rightId}' (right) as stereo pair`)
}

/**
 * Dissolves the sync group and lets both players output stereo again.
 * Players that are unreachable are skipped, so a pair can always be removed from the hub.
 */
export async function dissolveStereoPair(leftId: string, rightId: string) {
  const logger = useLogger('stereoPair')
  for (const playerId of [leftId, rightId]) {
    try {
      const { player } = await useSqueezePlayer(playerId)
      await player.unsync()
      await player.setOutputChannels('stereo')
    } catch (error) {
      logger.warn(`Could not reset player '${playerId}' of the dissolved stereo pair:`, error)
    }
  }
}
