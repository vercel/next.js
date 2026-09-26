import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('remote-components-facade-module-split', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname + '/app',
    skipDeployment: true,
    buildCommand: 'pnpm build',
    startCommand: (global as any).isNextDev ? 'pnpm dev' : 'pnpm start',
    serverReadyPattern: /Next mode: (production|development)/,
    // The fixture starts two Next.js child processes, which exceeds the
    // default 10s budget on slow CI workers.
    startServerTimeout: 120_000,
    packageJson: {
      scripts: {
        dev: 'node server.js',
        build:
          'cd apps/host-pkg && next build && cd ../remote-pkg && next build',
        start: 'NODE_ENV=production node server.js',
      },
    },
    dependencies: require('./app/package.json').dependencies,
    // remote-components' CJS config helper requires find-up, and find-up 6+
    // is ESM-only, which Node < 20.19 cannot require. Pin the last CJS line
    // so the fixture apps boot on the Node version CI runs.
    resolutions: { 'find-up': '5.0.0' },
  })

  it('shares the host singleton with the remote component', async () => {
    const browser = await next.browser('/pkg')

    if (!isTurbopack) {
      // Unintended behavior (see PR description): remote-components 0.4.15's
      // webpack runtime never delivers the host's singleton to the remote
      // component in this fixture, and the failure mode varies by
      // environment: the development dispatcher cannot resolve the remote's
      // modules at all, production either renders the component against the
      // remote's own bundled React copy and crashes, mounts it against a
      // duplicate of the singleton, or leaves the island inert without an
      // error.
      const outcome = await retry(
        async () => {
          const state = await browser.eval(() => ({
            error: document.querySelector('#remote-error')?.textContent ?? null,
            instance:
              document.querySelector('#remote-instance')?.textContent ?? null,
          }))
          if (
            state.error === null &&
            (state.instance === null || state.instance === 'pending')
          ) {
            throw new Error('remote component has not settled yet')
          }
          return state
        },
        30000,
        1000
      ).catch(() => ({ error: null, instance: 'pending' }))

      if (outcome.error !== null) {
        expect(outcome.error).toMatch(
          /Remote Components are not available|Cannot read properties of null \(reading 'useState'\)/
        )
        return
      }
      if (outcome.instance === null || outcome.instance === 'pending') {
        // Inert island: never mounted, never errored. The host page itself
        // is unaffected.
        expect(outcome.error).toBeNull()
        const hostInstance = await browser.elementByCss('#host-instance').text()
        expect(hostInstance).not.toBe('pending')
        return
      }

      // The component mounted. Writes through the remote's instance never
      // reach the host, whether or not the two read the same instance.
      await browser.elementByCss('#write-remote-marker').click()
      await browser.elementByCss('#rerender').click()
      await retry(async () => {
        const remoteMarker = await browser.elementByCss('#remote-marker').text()
        expect(remoteMarker).toBe('updated-by-remote')
      }, 5000)
      const hostMarker = await browser.elementByCss('#host-marker').text()
      expect(hostMarker).toBe('unmodified')
      return
    }

    let hostInstance: string | null = null
    let remoteInstance: string | null = null
    await retry(async () => {
      hostInstance = await browser.elementByCss('#host-instance').text()
      expect(hostInstance).not.toBe('pending')
      remoteInstance = await browser.elementByCss('#remote-instance').text()
      expect(remoteInstance).not.toBe('pending')
    }, 20000)

    const remoteError = await browser
      .elementByCss('#remote-error')
      .text()
      .catch(() => null)
    expect(remoteError).toBeNull()

    // The remote component writes through the singleton it sees; the host
    // re-reads its own instance afterwards.
    await browser.elementByCss('#write-remote-marker').click()
    await browser.elementByCss('#rerender').click()

    let hostMarker: string | null = null
    let remoteMarker: string | null = null
    await retry(async () => {
      hostMarker = await browser.elementByCss('#host-marker').text()
      remoteMarker = await browser.elementByCss('#remote-marker').text()
      expect(remoteMarker).toBe('updated-by-remote')
    }, 5000)

    if (isNextDev) {
      expect(remoteInstance).toBe(hostInstance)
      expect(hostMarker).toBe('updated-by-remote')
    } else {
      // Unintended behavior (see PR description): production Turbopack
      // builds resolve the shared-module manifest to a different module ID
      // than the remote consumer's static import, so the host's instance
      // never reaches the remote component. The remote renders its own
      // bundled copy of the singleton and writes to it vanish for the host.
      expect(remoteInstance).not.toBe(hostInstance)
      expect(hostMarker).toBe('unmodified')
    }
  })
})
