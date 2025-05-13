import { SqueezeServerStub } from 'lms-squeeze-rpc'
import type { ServerInfo } from 'lms-discovery'
import usePlayers from './usePlayers'

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
export default async function usePlayerInfo(targetClientIdentifier: string) {
  const storage = useStorage('DISCOVERY')

  const allPlayers = await usePlayers()
  const targetPlayerInfo = allPlayers.find((entry) => entry.playerInfo.playerid === targetClientIdentifier)
  if (!targetPlayerInfo) {
    throw new Error(`Player not found in storage for targetClientIdentifier '${targetClientIdentifier}'`)
  }

  const serverInfo = await storage.getItem<ServerInfo>(`servers/${targetPlayerInfo.serverId}`)
  if (!serverInfo || !serverInfo.ip) {
    throw new Error(`SqueezeServerStub not found in storage for player '${targetPlayerInfo.playerInfo.playerid}'`)
  }

  const serverStub = new SqueezeServerStub(`http://${serverInfo.ip}:${serverInfo.jsonPort || '9000'}`)
  const playerInfo = targetPlayerInfo.playerInfo
  return { playerInfo, serverInfo, serverStub }
}