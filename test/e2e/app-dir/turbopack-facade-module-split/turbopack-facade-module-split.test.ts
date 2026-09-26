import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// See the PR description for the full story. Two Next.js apps pair a host
// page with a remote page over one server; the host drives a slim scope
// require extracted from remote-components' source.
describe('turbopack-facade-module-split', () => {
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
        build: 'cd apps/host && next build && cd ../remote && next build',
        start: 'NODE_ENV=production node server.js',
      },
    },
    dependencies: require('./app/package.json').dependencies,
  })

  it('resolves shared module instances per current bundler behavior', async () => {
    const browser = await next.browser('/')

    let state: any
    await retry(async () => {
      const text = await browser.elementByCss('#sharing').text()
      expect(text).not.toBe('pending')
      state = JSON.parse(text)
    }, 20000)
    expect(state.error).toBeUndefined()

    expect(state.sharedModuleId).toBeTruthy()
    expect(state.consumerDemoPkgId).toBeTruthy()

    await browser.elementByCss('#write-host-marker').click()
    const after = JSON.parse(await browser.elementByCss('#sharing').text())

    if (isTurbopack && !isNextDev) {
      // Unintended behavior (see PR description): the manifest resolves a
      // re-export facade while the consumer imports the inner module, so the
      // install misses and each side keeps its own singleton instance.
      expect(state.sharedModuleId).not.toBe(state.consumerDemoPkgId)
      expect(state.remote.instanceId).not.toBe(state.host.instanceId)
      expect(after.host.marker).toBe('updated-by-host')
      expect(after.remote.marker).toBe('unmodified')
    } else {
      // Dev mode (both bundlers) and webpack (all modes): one module
      // instance, the install reaches the consumer.
      expect(state.sharedModuleId).toBe(state.consumerDemoPkgId)
      expect(state.remote.instanceId).toBe(state.host.instanceId)
      expect(after.host.marker).toBe('updated-by-host')
      expect(after.remote.marker).toBe('updated-by-host')
    }
  })
})
