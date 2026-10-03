import { GenericContainer, Network, SocatContainer, Wait, type StartedNetwork, type StartedTestContainer } from 'testcontainers'
import { SqueezeServerStub } from 'lms-squeeze-rpc-x'

/**
 * Real LMS stack for e2e tests: a Lyrion Music Server plus a headless squeezelite player, both in Docker.
 *
 * mDNS / UDP discovery does not cross Docker networks (and not the Docker Desktop VM on macOS), so nothing is discovered:
 * squeezelite is pointed to LMS by its network alias and the tests register LMS in the hub's storage with its mapped port.
 *
 * LMS resolves hostnames with its own DNS client that ignores /etc/hosts, so host aliases like `host.docker.internal`
 * (or testcontainers' `host.testcontainers.internal`) do not work for track URLs. Instead a socat relay joins the network as
 * PLEX_HOST and forwards to the fake Plex server on the test host, Docker's embedded DNS resolves the alias for LMS.
 */

export const LMS_IMAGE = process.env.E2E_LMS_IMAGE ?? 'lmscommunity/lyrionmusicserver:9.1.1'
export const SQUEEZELITE_IMAGE = process.env.E2E_SQUEEZELITE_IMAGE ?? 'giof71/squeezelite:debian-full-squeezelite-current-2026-08-05'
export const PLAYER_MAC = 'aa:bb:cc:00:00:01'
export const PLAYER_NAME = 'E2E Player'
/** Hostname the containers reach the fake Plex server on (same port as on the test host) */
export const PLEX_HOST = 'plex'

export interface LmsStack {
  /** Host and port the test process reaches the LMS JSON-RPC API on */
  host: string
  port: number
  stub: SqueezeServerStub
  stop(): Promise<void>
}

/**
 * Starts LMS and squeezelite and waits until the player is connected.
 * @param plexPort port of the fake Plex server on the test host, reachable from the containers as `PLEX_HOST:plexPort`
 */
export async function startLmsStack(plexPort: number): Promise<LmsStack> {
  const network: StartedNetwork = await new Network().start()
  const plexRelay = await new SocatContainer()
    .withNetwork(network)
    .withNetworkAliases(PLEX_HOST)
    .withExtraHosts([{ host: 'host.docker.internal', ipAddress: 'host-gateway' }])
    .withTarget(plexPort, 'host.docker.internal')
    .start()

  const lms: StartedTestContainer = await new GenericContainer(LMS_IMAGE)
    .withNetwork(network)
    .withNetworkAliases('lms')
    .withExposedPorts(9000)
    .withWaitStrategy(
      Wait.forHttp('/', 9000)
        .forStatusCodeMatching((status) => status < 500)
        .withStartupTimeout(180_000)
    )
    .start()

  const squeezelite: StartedTestContainer = await new GenericContainer(SQUEEZELITE_IMAGE)
    .withNetwork(network)
    .withEnvironment({
      SQUEEZELITE_SERVER_PORT: 'lms:3483',
      SQUEEZELITE_NAME: PLAYER_NAME,
      SQUEEZELITE_MAC_ADDRESS: PLAYER_MAC,
      // ALSA null device, there is no sound card in the container
      SQUEEZELITE_AUDIO_DEVICE: 'null'
    })
    .start()

  const host = lms.getHost()
  const port = lms.getMappedPort(9000)
  const stub = new SqueezeServerStub(`http://${host}:${port}`)
  await waitFor(async () => {
    const response: any = await stub.requestAsync(['', ['players', '0', '10']])
    return Number(response?.count) > 0
  }, 60_000)

  return {
    host,
    port,
    stub,
    async stop() {
      await squeezelite.stop()
      await lms.stop()
      await plexRelay.stop()
      await network.stop()
    }
  }
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Condition not met within ${timeoutMs}ms${lastError ? `: ${lastError}` : ''}`)
}
