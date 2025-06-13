import { defineEventHandler } from 'h3'
import useLogger from '~/server/composables/useLogger'
import usePlayers, { type PlayerInfoWithServerId } from '~/server/composables/usePlayers'

export default defineEventHandler(async (event) => {
  const logger = useLogger('players.get')  

  const players = await usePlayers()  

  interface PlayersResult {
    players: PlayerInfoWithServerId[]    
  }

  return {
    players
  } as PlayersResult
  
})
