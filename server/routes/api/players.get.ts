import { defineEventHandler, getQuery } from 'h3'
import useLogger from '~/server/composables/useLogger'
import usePlayers, { type PlayerInfoWithServerId } from '~/server/composables/usePlayers'

export default defineEventHandler(async (event) => {
  const logger = useLogger('token.get')
  const storage = useStorage('CREDENTIALS')

  const players = await usePlayers()  

  interface PlayersResult {
    players: PlayerInfoWithServerId[]    
  }

  return {
    players
  } as PlayersResult
  
})
