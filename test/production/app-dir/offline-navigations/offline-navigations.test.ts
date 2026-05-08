import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('offlineNavigations build artifacts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function getOfflineNavigationArtifactPaths() {
    const buildId = (await next.readFile('.next/BUILD_ID')).trim()

    return {
      buildId,
      fallbackDocument: {
        absolutePath: join(
          next.testDir,
          '.next',
          'static',
          buildId,
          '_offline-navigation-fallback.html'
        ),
        relativePath: `.next/static/${buildId}/_offline-navigation-fallback.html`,
      },
      serviceWorker: {
        absolutePath: join(
          next.testDir,
          '.next',
          'static',
          '_offline-navigation-service-worker.js'
        ),
        relativePath: `.next/static/_offline-navigation-service-worker.js`,
      },
      manifest: {
        absolutePath: join(
          next.testDir,
          '.next',
          'static',
          buildId,
          '_offline-navigation-manifest.json'
        ),
        relativePath: `.next/static/${buildId}/_offline-navigation-manifest.json`,
      },
    }
  }

  it('emits request-invariant offline navigation artifacts when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId, fallbackDocument, manifest, serviceWorker } =
      await getOfflineNavigationArtifactPaths()
    const html = await next.readFile(fallbackDocument.relativePath)
    const manifestJson = JSON.parse(await next.readFile(manifest.relativePath))
    const serviceWorkerScript = await next.readFile(serviceWorker.relativePath)

    expect(html).toContain('data-next-offline-navigation-fallback')
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_FALLBACK"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).toContain('self.__next_f')
    expect(html).toContain('/app-assets/_next/static/')
    expect(html).not.toContain('offline navigations page')

    expect(serviceWorkerScript).toContain(`"buildId":"${buildId}"`)
    expect(serviceWorkerScript).toContain(
      `"manifestHref":"/docs/_next/static/${buildId}/_offline-navigation-manifest.json"`
    )
    expect(serviceWorkerScript).toContain('skipWaiting')
    expect(serviceWorkerScript).toContain('clients.claim')
    expect(serviceWorkerScript).not.toContain('respondWith')

    expect(manifestJson).toEqual({
      version: 1,
      buildId,
      basePath: '/docs',
      assetPrefix: '/app-assets',
      trailingSlash: true,
      output: 'default',
      scope: '/docs/',
      cacheNamespace: `next-offline-navigation-v1:${buildId}:/docs`,
      manifest: {
        path: `static/${buildId}/_offline-navigation-manifest.json`,
        href: `/docs/_next/static/${buildId}/_offline-navigation-manifest.json`,
      },
      fallbackDocument: {
        path: `static/${buildId}/_offline-navigation-fallback.html`,
        href: `/docs/_next/static/${buildId}/_offline-navigation-fallback.html`,
      },
      serviceWorker: {
        path: `static/_offline-navigation-service-worker.js`,
        href: `/docs/_next/static/_offline-navigation-service-worker.js`,
      },
    })
  })

  it('registers the pass-through service worker when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    try {
      const swResponse = await next.fetch(
        `/docs/_next/static/_offline-navigation-service-worker.js${next.getDeploymentIdQuery()}`
      )
      expect(swResponse.status).toBe(200)
      expect(swResponse.headers.get('cache-control')).toBe(
        'no-cache, must-revalidate'
      )
      expect(swResponse.headers.get('service-worker-allowed')).toBe('/docs/')

      const browser = await next.browser('/docs')
      await retry(async () => {
        const registration = await browser.eval(async () => {
          if (!('serviceWorker' in navigator)) {
            return null
          }

          const registrations = await navigator.serviceWorker.getRegistrations()
          const registration = registrations.find((registration) =>
            registration.scope.endsWith('/docs/')
          )

          if (!registration) {
            return null
          }

          return {
            scope: registration.scope,
            scriptURL: registration.active?.scriptURL ?? null,
          }
        })

        expect(registration).toEqual({
          scope: `${next.url}/docs/`,
          scriptURL: `${next.url}/docs/_next/static/_offline-navigation-service-worker.js${next.getDeploymentIdQuery()}`,
        })
      })

      await browser.eval(async () => {
        if (!('serviceWorker' in navigator)) {
          return
        }

        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations.map((registration) => registration.unregister())
        )
      })
    } finally {
      await next.stop()
    }
  })

  it('does not emit offline navigation artifacts when disabled', async () => {
    await next.patchFile('next.config.js', (content) =>
      content.replace('offlineNavigations: true', 'offlineNavigations: false')
    )

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { fallbackDocument, manifest, serviceWorker } =
      await getOfflineNavigationArtifactPaths()
    expect(existsSync(fallbackDocument.absolutePath)).toBe(false)
    expect(existsSync(manifest.absolutePath)).toBe(false)
    expect(existsSync(serviceWorker.absolutePath)).toBe(false)
  })
})
