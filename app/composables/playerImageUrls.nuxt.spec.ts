import { describe, expect, it } from 'vitest'
import type { ServerInfo } from 'lms-discovery'
import type { IPlayerInfo } from 'lms-squeeze-rpc-x/dist/modelTypes'
import { playerImageUrls } from './usePlayerDashboard'

const server = { ip: '192.168.1.20', jsonPort: '9000' } as ServerInfo
const base = 'http://192.168.1.20:9000/html/images/Players'
const urls = (model: string, modelname = '') => playerImageUrls({ model, modelname } as IPlayerInfo, server)

describe('playerImageUrls', () => {
  it('uses the model image and falls back to the Softsqueeze one like Lyrion', () => {
    expect(urls('baby', 'Squeezebox Radio')).toEqual([`${base}/baby_250x250.png`, `${base}/softsqueeze_250x250.png`])
  })

  it('uses the Squeezebox image for Squeezebox 2', () => {
    expect(urls('squeezebox2')).toEqual([`${base}/squeezebox_250x250.png`, `${base}/softsqueeze_250x250.png`])
  })

  it('tries an image named after the model name of Squeezelite players first, e.g. pCP', () => {
    expect(urls('squeezelite', 'SqueezeLite-pCP')).toEqual([
      `${base}/squeezelite-pcp_250x250.png`,
      `${base}/squeezelite_250x250.png`,
      `${base}/softsqueeze_250x250.png`
    ])
  })

  it('does not repeat an image', () => {
    expect(urls('squeezelite', 'SqueezeLite')).toEqual([`${base}/squeezelite_250x250.png`, `${base}/softsqueeze_250x250.png`])
    expect(urls('softsqueeze')).toEqual([`${base}/softsqueeze_250x250.png`])
  })
})
