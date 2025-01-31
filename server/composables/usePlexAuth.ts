// import useLogger from '~/server/composables/useLogger'
// import axios from 'axios'
// import type { IPlayerInfo, IPlayerStatus } from 'lms-squeeze-rpc/dist/modelTypes'

// export default function usePlexAuth() {
//   const logger = useLogger('usePlexAuth')
//   const storage = useStorage('CREDENTIALS')

//   async function authApiRequest(plexToken: string, player: IPlayerInfo) {    
//     return storage.getItem('plexToken').then(async (plexToken) => {
//       if (plexToken) {
//         const plexHeaders = {
//           'X-Plex-Token': plexToken.toString(),
//           'X-Plex-Client-Identifier': player.playerid,
//           'X-Plex-Device-Name': player.name,
//           'X-Plex-Product': 'SqueezePlexHub',
//           'X-Plex-Platform': 'Konvergo',
//           'X-Plex-Platform-Version': '1.0',
//           'X-Plex-Client-Platform': 'SqueezeOS',
//           'X-Plex-Provides': 'player,pubsub-player',
//           'X-Plex-Device': 'Squeezebox',
//           'X-Plex-Version': '1.0.0', // Replace with package.json version
//           'X-Plex-Device-Screen-Resolution': '240x320',
//           'X-Plex-Device-Screen-Density': '1',
//           'X-Plex-Model': 'Squeeze Device',
//           'X-Plex-Protocol-Capabilities': 'playback,timeline',
//           'X-Plex-Protocol-Version': '1',
//           'X-Plex-Device-Vendor': 'Acme Inc.'
//         }

//         try {
//           const response = await axios.post('https://plex.tv/users/sign_in.json', {}, { headers: plexHeaders })
//           logger.info('Auth API request successful', response.data)
//           return response.data
//         } catch (error) {
//           logger.error('Error making auth API request:', error)
//           throw error
//         }
//       } else {
//         logger.info('No Plex token found in storage')
//         throw new Error('No Plex token found in storage, please authenticate first')
//       }
//     })
//   }

//   return {
//     authApiRequest
//   }
// }
