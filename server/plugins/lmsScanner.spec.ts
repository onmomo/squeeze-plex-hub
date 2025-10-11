import { describe, it, vi, expect, afterEach, type Mock } from 'vitest'
import { lmsScanner } from './lmsScanner'
import discovery from 'lms-discovery'

vi.mock('../composables/useLogger', () => ({
  default: () => ({
    info: (msg: string) => console.log(msg),
    warn: (msg: string) => console.log(msg),
    error: (msg: string) => console.log(msg)
  })
}))

vi.mock('lms-discovery', () => {
  const mockDiscoveryInstance = {
    start: vi.fn(),
    on: vi.fn()
  }
  return {
    default: mockDiscoveryInstance,
    discovery: mockDiscoveryInstance
  }
})

const mockSetItem = vi.fn()
const mockRemoveItem = vi.fn()
vi.stubGlobal('useStorage', () => ({
  setItem: mockSetItem,
  remove: mockRemoveItem
}))

const mockRunTask = vi.fn()
vi.stubGlobal('runTask', mockRunTask)

describe('lmsScanner', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should handle discovered event', async () => {
    lmsScanner()

    expect(discovery.start).toHaveBeenCalled()
    // Simulate discovered event
    const server = { name: 'Test', ip: '1.2.3.4', jsonPort: 9000, uuid: 'abc' }
    const discoveredCallback = (discovery.on as Mock).mock.calls.find(([event]) => event === 'discovered')?.[1]

    await discoveredCallback(server)

    expect(mockSetItem).toHaveBeenCalledWith('servers/abc', server)
    // Wait for any microtasks to complete if the callback is async
    await Promise.resolve()
    expect(mockRunTask).toHaveBeenCalledWith('squeezePlayersScanner', {})
  })

  it('should handle lost event', async () => {
    lmsScanner()

    expect(discovery.start).toHaveBeenCalled()
    // Simulate lost event
    const server = { name: 'Test', ip: '1.2.3.4', jsonPort: 9000, uuid: 'byebye' }
    const discoveredCallback = (discovery.on as Mock).mock.calls.find(([event]) => event === 'lost')?.[1]

    await discoveredCallback(server)

    expect(mockRemoveItem).toHaveBeenCalledWith('servers/byebye', server)
  })

  it('should handle error event', async () => {
    lmsScanner()

    expect(discovery.start).toHaveBeenCalled()
    // Simulate error event
    const discoveredCallback = (discovery.on as Mock).mock.calls.find(([event]) => event === 'error')?.[1]

    await discoveredCallback(new Error('Test error'))

    expect(mockSetItem).not.toHaveBeenCalled()
    expect(mockRemoveItem).not.toHaveBeenCalled()
  })
})
