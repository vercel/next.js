import path from 'path'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Turbopack Module Federation', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: path.join(__dirname, 'fixtures/two-app'),
    skipStart: true,
    skipDeployment: true,
    forcedPort: 'random',
    buildCommand: 'pnpm build',
    startCommand: isNextDev ? 'pnpm dev' : 'pnpm start',
    serverReadyPattern: /Next mode: (production|development)/,
    packageJson: {
      scripts: {
        dev: 'node build-webpack-remote.js development && node server.js',
        build:
          'node build-webpack-remote.js production && next build apps/remote && next build apps/host',
        start: 'NODE_ENV=production node server.js',
      },
    },
  })

  if (skipped) return

  if (!isTurbopack) {
    it('is only enabled with Turbopack', () => {})
    return
  }

  beforeAll(async () => {
    await next.start()

    // The container must be available as a cold endpoint. A consumer cannot
    // rely on a user visiting a route in the remote application first.
    await retry(async () => {
      expect(
        (await next.fetch('/remote/_next/static/custom/remoteEntry.js')).status
      ).toBe(200)
    }, 30_000)
  })

  it('emits a loadable remote container from a real Next.js application', async () => {
    const response = await next.fetch(
      '/remote/_next/static/custom/remoteEntry.js'
    )
    const source = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, must-revalidate'
    )
    expect(source.length).toBeGreaterThan(0)
    expect(source).toContain('remoteApp')
  })

  it('renders a hooked remote component with shared React after falling back', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('#remote-status').text()).toBe('loaded')
      expect(await browser.elementByCss('#shared-react').text()).toBe('same')
      expect(await browser.elementByCss('#root-expose-marker').text()).toBe(
        'exact remote root expose'
      )
      expect(await browser.elementByCss('#shared-marker').text()).toBe(
        'project-relative shared marker'
      )
      expect(await browser.elementByCss('#remote-button').text()).toBe(
        'remote count: 1'
      )
    }, 30_000)

    await browser.elementByCss('#remote-button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#remote-button').text()).toBe(
        'remote count: 2'
      )
    })

    const loadedResources = await browser.eval(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name)
    )
    expect(loadedResources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/missing-remote-entry.js'),
        expect.stringContaining('/remote/_next/static/custom/remoteEntry.js'),
      ])
    )
  })

  it('consumes the remote from a Pages Router route', async () => {
    const browser = await next.browser('/pages-router')

    await retry(async () => {
      expect(await browser.elementByCss('#pages-remote-status').text()).toBe(
        'loaded'
      )
      expect(await browser.elementByCss('#remote-button').text()).toBe(
        'remote count: 5'
      )
    }, 30_000)

    await browser.elementByCss('#remote-button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#remote-button').text()).toBe(
        'remote count: 6'
      )
    })
  })

  it('consumes a remote container emitted by Webpack', async () => {
    const browser = await next.browser('/webpack')

    await retry(async () => {
      expect(await browser.elementByCss('#webpack-greeting').text()).toBe(
        'hello from a Webpack remote'
      )
    }, 30_000)

    const loadedResources = await browser.eval(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name)
    )
    const webpackResources = loadedResources.filter((resource) =>
      resource.includes('/remote/webpack-remote/')
    )

    expect(webpackResources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/remote/webpack-remote/remoteEntry.js'),
      ])
    )
    expect(
      webpackResources.some(
        (resource) =>
          resource.endsWith('.js') && !resource.endsWith('/remoteEntry.js')
      )
    ).toBe(true)
  })

  it('allows a Webpack host to consume the Turbopack container', async () => {
    const browser = await next.browser('/webpack-host/index.html', {
      waitHydration: false,
    })

    await retry(async () => {
      expect(await browser.elementByCss('#webpack-host-status').text()).toBe(
        'exact remote root expose'
      )
    }, 30_000)

    const loadedResources = await browser.eval(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name)
    )
    expect(loadedResources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/remote/_next/static/custom/remoteEntry.js'),
      ])
    )
  })

  if (isNextDev) {
    it('re-emits the stable remote entry when an exposed module changes', async () => {
      const file = 'apps/remote/components/Button.tsx'
      const original = await next.readFile(file)
      const updated = original.replace(
        'remote count: {count}',
        'updated remote count: {count}'
      )

      await next.patchFile(file, updated)
      try {
        await retry(async () => {
          const response = await next.fetch(
            '/remote/_next/static/custom/remoteEntry.js'
          )
          expect(response.status).toBe(200)
          expect(await response.text()).toContain('updated remote count:')
        }, 30_000)
      } finally {
        await next.patchFile(file, original)
      }

      await retry(async () => {
        const response = await next.fetch(
          '/remote/_next/static/custom/remoteEntry.js'
        )
        expect(response.status).toBe(200)
        expect(await response.text()).not.toContain('updated remote count:')
      }, 30_000)
    })
  }
})
