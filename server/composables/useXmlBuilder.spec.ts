import { describe, it, expect } from 'vitest'
import useXmlBuilder from './useXmlBuilder'

describe('useXmlBuilder', () => {
  const sampleContainer = {
    MediaContainer: {
      $: { size: 1, commandID: 'test-cmd' },
      Timeline: [
        {
          $: {
            state: 'playing',
            type: 'video',
            itemType: 'movie',
            volume: '80',
            controllable: '1',
            time: '12345',
            duration: '67890',
            shuffle: '0',
            repeat: '0',
            mute: '0',
            playQueueItemID: '42',
            key: '/library/metadata/1',
            ratingKey: '1',
            playQueueID: '99',
            playQueueVersion: '2',
            containerKey: '/playQueues/99',
            machineIdentifier: 'abcdef',
            protocol: 'http',
            address: '192.168.1.100',
            port: '32400'
          }
        }
      ]
    }
  }

  it('should return a valid XML string for a valid container', () => {
    const { xmlString } = useXmlBuilder(sampleContainer)
    expect(xmlString).toContain('<MediaContainer')
    expect(xmlString).toContain('<Timeline')
    expect(xmlString).toContain('type="video"')
    expect(xmlString).toContain('state="playing"')
    expect(xmlString).toContain('time="12345"')
    expect(xmlString).toContain('containerKey="/playQueues/99"')
  })

  it('should throw an error if container is not provided', () => {
    // @ts-expect-error testing runtime error
    expect(() => useXmlBuilder(undefined)).toThrow()
  })

  it('should include XML declaration when headless is false', () => {
    const { xmlString } = useXmlBuilder(sampleContainer, false)
    expect(xmlString.startsWith('<?xml')).toBe(true)
  })

  it('should not include XML declaration when headless is true', () => {
    const { xmlString } = useXmlBuilder(sampleContainer, true)
    expect(xmlString.startsWith('<?xml')).toBe(false)
  })
})
