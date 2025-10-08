import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

export type PlayerInfoWithServerId = {
  // LMS serverId
  serverId: string
  // Squeeze player info
  playerInfo: IPlayerInfo
}

/**
 * This function retrieves all squeeze players from the storage.*
 */
export default async function usePlayers() {
  const storage = useStorage('DISCOVERY')

  const serverKeys = await storage.getKeys('players/')
  if (!serverKeys || serverKeys.length === 0) {
    throw new Error('No LMS found in storage, skipping')
  }

  const allPlayers: PlayerInfoWithServerId[] = []

  for (const key of serverKeys) {
    const playerInfos = await storage.getItem<IPlayerInfo[]>(key)
    const serverId = key.split(':')[1]
    if (playerInfos && serverId) {
      for (const playerInfo of playerInfos) {
        allPlayers.push({ serverId, playerInfo })
      }
    }
  }

  return allPlayers
}
