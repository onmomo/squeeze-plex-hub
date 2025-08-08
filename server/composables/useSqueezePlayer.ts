import usePlayerInfo from './usePlayerInfo'
import ExtendedSqueezePlayer from '../lib/squeezePlayer'

/**
 * Initializes and returns an ExtendedSqueezePlayer instance for the given client identifier.
 *
 * @param targetClientIdentifier - The unique identifier of the target Squeeze player.
 * @returns An object containing the initialized ExtendedSqueezePlayer instance.
 * @throws If player information or server stub cannot be retrieved.
 */
export default async function useSqueezePlayer(targetClientIdentifier: string) {
  const { playerInfo, serverStub } = await usePlayerInfo(targetClientIdentifier)
  const player = new ExtendedSqueezePlayer(serverStub, playerInfo)
  
  return { player }
}