import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'

export interface DemoServer {
  server: ServerInfo
  players: IPlayerInfo[]
}

/**
 * Fake LMS servers and players served in demo mode (`NUXT_DEMO=true`).
 */
export const demoServers: DemoServer[] = [
  {
    server: {
      ip: '192.168.1.20',
      name: 'Lyrion NAS',
      ver: '9.0.2',
      uuid: 'demo-0d6c1f2e-lyrion-nas',
      jsonPort: '9000',
      cliPort: '9090'
    },
    players: [
      {
        playerid: '00:04:20:2a:11:01',
        name: 'Living Room',
        model: 'fab4',
        modelname: 'Squeezebox Touch',
        firmware: '8.0.1-r16952',
        ip: '192.168.1.41'
      },
      {
        playerid: '00:04:20:2a:11:02',
        name: 'Kitchen Counter',
        model: 'baby',
        modelname: 'Squeezebox Radio',
        firmware: '8.0.1-r16952',
        ip: '192.168.1.42'
      },
      {
        playerid: '00:04:20:2a:11:07',
        name: 'Kitchen Shelf',
        model: 'baby',
        modelname: 'Squeezebox Radio',
        firmware: '8.0.1-r16952',
        ip: '192.168.1.47'
      },
      {
        playerid: 'b8:27:eb:5c:0f:03',
        name: 'Office',
        model: 'squeezelite',
        modelname: 'SqueezeLite',
        firmware: 'v2.0.0-1488',
        ip: '192.168.1.43'
      },
      {
        playerid: '00:04:20:2a:11:04',
        name: 'Living Room Transporter',
        model: 'transporter',
        modelname: 'Transporter',
        firmware: '87',
        ip: '192.168.1.44'
      }
    ]
  },
  {
    server: {
      ip: '192.168.1.30',
      name: 'Lyrion Attic',
      ver: '8.5.2',
      uuid: 'demo-7a91b3c4-lyrion-attic',
      jsonPort: '9000',
      cliPort: '9090'
    },
    players: [
      { playerid: '00:04:20:2a:22:05', name: 'Workshop', model: 'boom', modelname: 'Squeezebox Boom', firmware: '57', ip: '192.168.1.51' },
      {
        playerid: 'dc:a6:32:7e:4b:06',
        name: 'Bedroom',
        model: 'squeezeplay',
        modelname: 'SqueezePlay',
        firmware: '8.0.1-r1382',
        ip: '192.168.1.52'
      }
    ]
  }
]
