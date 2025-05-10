import { SqueezeServerStub } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc/dist/modelTypes'

/**
 * This function retrieves the player information and server information for a given squeeze target client identifier.
 * It searches through the storage for all discovered squeeze players and finds the one that matches the target client identifier.
 * 
 * @param targetClientIdentifier The target client identifier to find the player info for
 * @returns An object containing the player info, server info, and server stub
 * @throws An error if the player is not found in storage or if the server info is not available
 * @throws An error if no LMS is found in storage
 * @throws An error if the server stub is not found in storage
 */
export default async function userPlayerInfo(targetClientIdentifier: string) {
  const storage = useStorage('DISCOVERY')

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
    throw new Error(`Player not found in storage for targetClientIdentifier '${targetClientIdentifier}'`)
  }

  const [serverId, playerInfo] = playerServerTuple

  const serverInfo = await storage.getItem<ServerInfo>(`servers/${serverId}`)
  if (!serverInfo || !serverInfo.ip) {
    throw new Error(`SqueezeServerStub not found in storage for player '${playerInfo.playerid}'`)
  }

  const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)

  return { playerInfo, serverInfo, serverStub }
}