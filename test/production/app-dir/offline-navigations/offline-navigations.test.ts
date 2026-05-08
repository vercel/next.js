import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS =
  'next-offline-navigation-cache-static-assets'

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
      buildStaticDirectory: {
        absolutePath: join(next.testDir, '.next', 'static', buildId),
      },
    }
  }

  function getOfflineNavigationBuildFileNames(directory: string): string[] {
    return readdirSync(directory)
      .filter((entry) => entry.startsWith('_offline-navigation-'))
      .sort()
  }

  async function readOfflineNavigationCacheState(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(async () => {
      const cacheNames = (await caches.keys()).filter((cacheName) =>
        cacheName.startsWith('next-offline-navigation-v1:')
      )
      const entries: Array<{ cacheName: string; pathname: string }> = []

      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName)
        const requests = await cache.keys()

        for (const request of requests) {
          entries.push({
            cacheName,
            pathname: new URL(request.url).pathname,
          })
        }
      }

      return { cacheNames, entries }
    })
  }

  it('emits request-invariant offline navigation artifacts when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId, buildStaticDirectory, fallbackDocument, serviceWorker } =
      await getOfflineNavigationArtifactPaths()
    const html = await next.readFile(fallbackDocument.relativePath)
    const serviceWorkerScript = await next.readFile(serviceWorker.relativePath)

    expect(
      getOfflineNavigationBuildFileNames(buildStaticDirectory.absolutePath)
    ).toEqual(['_offline-navigation-fallback.html'])

    expect(html).toContain('data-next-offline-navigation-fallback')
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_FALLBACK"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).not.toContain('"source"')
    expect(html).toContain(
      '<script>(self.__next_f=self.__next_f||[]).push([0])</script>'
    )
    expect(html).toContain('/app-assets/_next/static/')
    expect(html).not.toContain('offline navigations page')
    expect(html).not.toContain('\n')
    expect(html.length).toBeLessThan(4096)

    expect(serviceWorkerScript).toContain(
      `"cacheNamespace":"next-offline-navigation-v1:${buildId}:/docs"`
    )
    expect(serviceWorkerScript).toContain(
      `"fallbackDocumentHref":"/docs/_next/static/${buildId}/_offline-navigation-fallback.html"`
    )
    expect(serviceWorkerScript).toContain(
      '"fallbackAssetHrefs":["/app-assets/_next/static/'
    )
    expect(serviceWorkerScript).not.toContain('"source"')
    expect(serviceWorkerScript).toContain('cacheOfflineNavigationResources')
    expect(serviceWorkerScript).toContain('cacheCurrentStaticAssets')
    expect(serviceWorkerScript).toContain('fetchManagedStaticAsset')
    expect(serviceWorkerScript).toContain('getManagedStaticAssetCacheKey')
    expect(serviceWorkerScript).toContain("cache:'only-if-cached'")
    expect(serviceWorkerScript).toContain("mode:'same-origin'")
    expect(serviceWorkerScript).not.toContain("cache:'force-cache'")
    expect(serviceWorkerScript).toContain('caches.delete')
    expect(serviceWorkerScript).toContain(
      OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS
    )
    expect(serviceWorkerScript).toContain('skipWaiting')
    expect(serviceWorkerScript).toContain('clients.claim')
    expect(serviceWorkerScript).not.toContain('\n')
    expect(serviceWorkerScript).toContain('respondWith')
    expect(serviceWorkerScript.length).toBeLessThan(6000)
  })

  it('registers the service worker and caches offline resources when enabled', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId } = await getOfflineNavigationArtifactPaths()
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

      const cacheName = `next-offline-navigation-v1:${buildId}:/docs`
      await retry(async () => {
        const cacheState = await readOfflineNavigationCacheState(browser)
        expect(cacheState.cacheNames).toContain(cacheName)
        expect(cacheState.entries).toEqual(
          expect.arrayContaining([
            {
              cacheName,
              pathname: `/docs/_next/static/${buildId}/_offline-navigation-fallback.html`,
            },
            {
              cacheName,
              pathname: expect.stringMatching(
                /^\/app-assets\/_next\/static\/(?:immutable\/)?chunks\/.+\.js$/
              ),
            },
          ])
        )
      })

      await browser.eval(async () => {
        if (!('serviceWorker' in navigator)) {
          return
        }

        const cacheNames = await caches.keys()
        await Promise.all(
          cacheNames
            .filter((cacheName) =>
              cacheName.startsWith('next-offline-navigation-v1:')
            )
            .map((cacheName) => caches.delete(cacheName))
        )

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

    const { buildStaticDirectory, fallbackDocument, serviceWorker } =
      await getOfflineNavigationArtifactPaths()
    expect(existsSync(fallbackDocument.absolutePath)).toBe(false)
    expect(
      existsSync(
        join(
          buildStaticDirectory.absolutePath,
          '_offline-navigation-manifest.json'
        )
      )
    ).toBe(false)
    expect(existsSync(serviceWorker.absolutePath)).toBe(false)
  })
})
