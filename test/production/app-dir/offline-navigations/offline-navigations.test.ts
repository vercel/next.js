import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

const OFFLINE_NAVIGATION_FALLBACK_SERVED =
  'next-offline-navigation-fallback-served'

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

  async function readPersistedOfflineNavigationEntry(
    browser: Awaited<ReturnType<typeof next.browser>>,
    urlSubstring: string
  ) {
    return browser.eval(async (substring) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 2)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('navigation-data')) {
            database.createObjectStore('navigation-data', {
              keyPath: ['buildId', 'url'],
            })
          }
          if (!database.objectStoreNames.contains('metadata')) {
            database.createObjectStore('metadata')
          }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      try {
        const entries = await new Promise<any[]>((resolve, reject) => {
          const transaction = database.transaction(
            'navigation-data',
            'readonly'
          )
          const request = transaction.objectStore('navigation-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const entry = entries.find((entry) => entry.url.includes(substring))
        if (!entry) {
          return null
        }

        return {
          buildId: entry.buildId,
          cacheEpoch: entry.cacheEpoch,
          expiresAt: entry.expiresAt,
          kind: entry.kind,
          payload: {
            bodyLength: entry.payload.body.byteLength,
            kind: entry.payload.kind,
            requestKind: entry.payload.requestKind,
            status: entry.payload.status,
          },
          staleAt: entry.staleAt,
          url: entry.url,
          version: entry.version,
        }
      } finally {
        database.close()
      }
    }, urlSubstring)
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
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_CACHE_MISS"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    if (next.deploymentId) {
      expect(html).toContain(`data-dpl-id="${next.deploymentId}"`)
    }
    expect(html).toContain('self.__next_f')
    expect(html).toContain('/app-assets/_next/static/')
    expect(html).not.toContain('offline navigations page')

    expect(serviceWorkerScript).toContain(`"buildId":"${buildId}"`)
    expect(serviceWorkerScript).toContain(
      `"cacheNamespace":"next-offline-navigation-v1:${buildId}:/docs"`
    )
    expect(serviceWorkerScript).toContain(
      `"fallbackDocumentHref":"/docs/_next/static/${buildId}/_offline-navigation-fallback.html"`
    )
    expect(serviceWorkerScript).toContain(
      `"manifestHref":"/docs/_next/static/${buildId}/_offline-navigation-manifest.json"`
    )
    expect(serviceWorkerScript).toContain('cacheOfflineNavigationResources')
    expect(serviceWorkerScript).toContain('caches.delete')
    expect(serviceWorkerScript).toContain(OFFLINE_NAVIGATION_FALLBACK_SERVED)
    expect(serviceWorkerScript).toContain('isDocumentNavigationRequest')
    expect(serviceWorkerScript).toContain('skipWaiting')
    expect(serviceWorkerScript).toContain('clients.claim')
    expect(serviceWorkerScript).toContain('respondWith')

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

    const { buildId } = await getOfflineNavigationArtifactPaths()
    const navigationBuildId = next.deploymentId ?? buildId
    await next.start({ skipBuild: true })

    let page: Playwright.Page | undefined
    try {
      const swResponse = await next.fetch(
        `/docs/_next/static/_offline-navigation-service-worker.js${next.getDeploymentIdQuery()}`
      )
      expect(swResponse.status).toBe(200)
      expect(swResponse.headers.get('cache-control')).toBe(
        'no-cache, must-revalidate'
      )
      expect(swResponse.headers.get('service-worker-allowed')).toBe('/docs/')

      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
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
      await retry(async () => {
        expect(
          await browser.eval(() => Boolean(navigator.serviceWorker.controller))
        ).toBe(true)
      })
      expect(await browser.elementById('offline-status').text()).toBe('online')

      await browser.eval((messageType) => {
        const win = window as typeof window & {
          __restoreOfflineNavigationFetch?: () => void
        }
        const originalFetch = window.fetch
        win.__restoreOfflineNavigationFetch = () => {
          window.fetch = originalFetch
          delete win.__restoreOfflineNavigationFetch
        }
        window.fetch = async () => {
          throw new TypeError('offline navigation test')
        }
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent('message', {
            data: {
              type: messageType,
              reason: 'network-error',
              url: location.href,
            },
          })
        )
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)
      await retry(async () => {
        expect(await browser.elementById('offline-status').text()).toBe(
          'offline'
        )
      })
      await browser.eval(() => {
        const win = window as typeof window & {
          __restoreOfflineNavigationFetch?: () => void
        }
        win.__restoreOfflineNavigationFetch?.()
        window.dispatchEvent(new Event('online'))
      })
      await retry(async () => {
        expect(await browser.elementById('offline-status').text()).toBe(
          'online'
        )
      })

      const cacheState = await browser.eval(async () => {
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

      const cacheName = `next-offline-navigation-v1:${buildId}:/docs`
      expect(cacheState.cacheNames).toContain(cacheName)
      expect(cacheState.entries).toEqual(
        expect.arrayContaining([
          {
            cacheName,
            pathname: `/docs/_next/static/${buildId}/_offline-navigation-manifest.json`,
          },
          {
            cacheName,
            pathname: `/docs/_next/static/${buildId}/_offline-navigation-fallback.html`,
          },
        ])
      )

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual({
          buildId: navigationBuildId,
          cacheEpoch: 0,
          expiresAt: expect.any(Number),
          kind: 'exact-url',
          payload: {
            bodyLength: expect.any(Number),
            kind: 'rsc-response',
            requestKind: 'initial-load',
            status: 200,
          },
          staleAt: expect.any(Number),
          url: expect.stringContaining('/docs/'),
          version: 2,
        })
        expect(initialLoadEntry!.payload.bodyLength).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const initialLoadOfflineResponse = await page!.goto(`${next.url}/docs/`, {
        waitUntil: 'domcontentloaded',
      })
      expect(initialLoadOfflineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })
      expect(await browser.elementById('offline-status').text()).toBe('offline')
      expect(
        await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<unknown>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.at(-1)
        })
      ).toMatchObject({
        type: 'cache-hit',
        requestKind: 'initial-load',
        url: `${next.url}/docs/`,
      })
      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      await retry(async () => {
        expect(await browser.elementById('offline-status').text()).toBe(
          'online'
        )
      })

      await browser.elementById('refresh-offline-navigation').click()
      await retry(async () => {
        const refreshedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(refreshedEntry).toEqual({
          buildId: navigationBuildId,
          cacheEpoch: 1,
          expiresAt: expect.any(Number),
          kind: 'exact-url',
          payload: {
            bodyLength: expect.any(Number),
            kind: 'rsc-response',
            requestKind: 'navigation',
            status: 200,
          },
          staleAt: expect.any(Number),
          url: expect.stringContaining('/docs/'),
          version: 2,
        })
        expect(refreshedEntry!.payload.bodyLength).toBeGreaterThan(0)
      })

      await browser.eval((messageType) => {
        localStorage.removeItem('__nextOfflineNavigationMessage')
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === messageType) {
            localStorage.setItem(
              '__nextOfflineNavigationMessage',
              JSON.stringify(event.data)
            )
          }
        })
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)

      await browser.elementById('prefetch-offline-navigation').click()
      await retry(async () => {
        const persistedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/prefetched'
        )
        expect(persistedEntry).toEqual({
          buildId: navigationBuildId,
          cacheEpoch: 1,
          expiresAt: expect.any(Number),
          kind: 'exact-url',
          payload: {
            bodyLength: expect.any(Number),
            kind: 'rsc-response',
            requestKind: 'client-resume',
            status: 200,
          },
          staleAt: expect.any(Number),
          url: expect.stringContaining('/docs/prefetched'),
          version: 2,
        })
        expect(persistedEntry!.payload.bodyLength).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const cachedOfflineResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedOfflineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
      })
      expect(await browser.elementById('offline-status').text()).toBe('offline')
      expect(
        await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<unknown>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.at(-1)
        })
      ).toMatchObject({
        type: 'cache-hit',
        requestKind: 'client-resume',
        url: `${next.url}/docs/prefetched`,
      })
      const cachedServiceWorkerMessage = await browser.eval(() => {
        const message = localStorage.getItem('__nextOfflineNavigationMessage')
        return message === null ? null : JSON.parse(message)
      })
      expect(cachedServiceWorkerMessage).toMatchObject({
        type: OFFLINE_NAVIGATION_FALLBACK_SERVED,
        buildId,
        reason: 'network-error',
        url: `${next.url}/docs/prefetched`,
      })

      const nonNavigationResult = await browser.eval(async () => {
        try {
          await fetch('/docs?__next_offline_probe=1', {
            headers: { rsc: '1' },
          })
          return 'resolved'
        } catch {
          return 'rejected'
        }
      })
      expect(nonNavigationResult).toBe('rejected')

      await browser.eval(
        async ({ buildId: entryBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 2)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const transaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            transaction.objectStore('navigation-data').put({
              version: 2,
              kind: 'exact-url',
              buildId: entryBuildId,
              url,
              cacheEpoch: 1,
              createdAt: Date.now(),
              staleAt: Date.now() + 60_000,
              expiresAt: Date.now() + 60_000,
              payload: { kind: 'not-rsc-response' },
            })
            await new Promise<void>((resolve, reject) => {
              transaction.oncomplete = () => resolve()
              transaction.onerror = () => reject(transaction.error)
              transaction.onabort = () => reject(transaction.error)
            })
          } finally {
            database.close()
          }
        },
        {
          buildId: navigationBuildId,
          url: `${next.url}/docs/malformed-offline-entry/`,
        }
      )

      await next.stop()
      const malformedResponse = await page!.goto(
        `${next.url}/docs/malformed-offline-entry/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(malformedResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.eval(() =>
            document.documentElement.getAttribute(
              'data-next-offline-navigation-cache-reason'
            )
          )
        ).toBe('invalid-payload')
      })

      const offlineResponse = await page!.goto(
        `${next.url}/docs/offline-navigation-cache-miss`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(offlineResponse?.status()).toBe(200)
      expect(
        await browser.eval(() =>
          document.documentElement.hasAttribute(
            'data-next-offline-navigation-fallback'
          )
        )
      ).toBe(true)
      await retry(async () => {
        expect(
          await browser.eval(() => {
            const cacheMiss = document.getElementById(
              '__NEXT_OFFLINE_NAVIGATION_CACHE_MISS'
            )
            return cacheMiss === null
              ? null
              : {
                  hidden: cacheMiss.hidden,
                  reason: cacheMiss.getAttribute(
                    'data-next-offline-navigation-cache-reason'
                  ),
                  text: cacheMiss.textContent,
                }
          })
        ).toEqual({
          hidden: false,
          reason: 'missing-entry',
          text: 'This page is not available offline.',
        })
      })
      expect(
        await browser.eval(() => ({
          cache: document.documentElement.getAttribute(
            'data-next-offline-navigation-cache'
          ),
          reason: document.documentElement.getAttribute(
            'data-next-offline-navigation-cache-reason'
          ),
          diagnostic:
            (
              window as typeof window & {
                __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<unknown>
              }
            ).__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.at(-1) ?? null,
        }))
      ).toMatchObject({
        cache: 'miss',
        reason: 'missing-entry',
        diagnostic: {
          type: 'cache-miss',
          reason: 'missing-entry',
          url: `${next.url}/docs/offline-navigation-cache-miss`,
        },
      })
      await page!.context().setOffline(false)

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
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('replays request-sensitive exact URLs from browser-private storage', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId } = await getOfflineNavigationArtifactPaths()
    const navigationBuildId = next.deploymentId ?? buildId
    await next.start({ skipBuild: true })

    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await retry(async () => {
        expect(
          await browser.eval(() => Boolean(navigator.serviceWorker.controller))
        ).toBe(true)
      })

      await browser.eval(() => {
        document.cookie = 'offline-session=alpha; path=/; SameSite=Lax'
      })
      const onlineResponse = await page!.goto(
        `${next.url}/docs/request-sensitive/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('request-sensitive-page').text()).toBe(
          'request sensitive session: alpha'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/request-sensitive'
        )
        expect(entry).toEqual({
          buildId: navigationBuildId,
          cacheEpoch: expect.any(Number),
          expiresAt: expect.any(Number),
          kind: 'exact-url',
          payload: {
            bodyLength: expect.any(Number),
            kind: 'rsc-response',
            requestKind: 'initial-load',
            status: 200,
          },
          staleAt: expect.any(Number),
          url: expect.stringContaining('/docs/request-sensitive'),
          version: 2,
        })
        expect(entry!.payload.bodyLength).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const offlineResponse = await page!.goto(
        `${next.url}/docs/request-sensitive/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(offlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('request-sensitive-page').text()).toBe(
          'request sensitive session: alpha'
        )
      })
      expect(await browser.elementById('offline-status').text()).toBe('offline')

      await page!.context().setOffline(false)
      await browser.eval(async () => {
        window.dispatchEvent(new Event('online'))

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
      if (page) {
        await page.context().setOffline(false)
      }
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
