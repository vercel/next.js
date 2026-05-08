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
        const request = indexedDB.open('next-offline-navigation-cache', 3)
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('navigation-data')) {
            database.createObjectStore('navigation-data', {
              keyPath: ['buildId', 'url'],
            })
          }
          if (!database.objectStoreNames.contains('route-data')) {
            database.createObjectStore('route-data', {
              keyPath: ['buildId', 'key'],
            })
          }
          if (!database.objectStoreNames.contains('segment-data')) {
            database.createObjectStore('segment-data', {
              keyPath: ['buildId', 'key'],
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

  async function readPersistedOfflineNavigationRouteRecords(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 3)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      try {
        const entries = await new Promise<any[]>((resolve, reject) => {
          const transaction = database.transaction('route-data', 'readonly')
          const request = transaction.objectStore('route-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

        return entries.map((entry) => ({
          buildId: entry.buildId,
          cacheEpoch: entry.cacheEpoch,
          expiresAt: entry.expiresAt,
          hasMetadata: entry.metadata !== null,
          hasTree: entry.tree !== null,
          key: entry.key,
          kind: entry.kind,
          route: entry.route,
          routeVaryPath: entry.routeVaryPath,
          staleAt: entry.staleAt,
          version: entry.version,
        }))
      } finally {
        database.close()
      }
    })
  }

  async function readPersistedOfflineNavigationSegmentRecords(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 3)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      try {
        const entries = await new Promise<any[]>((resolve, reject) => {
          const transaction = database.transaction('segment-data', 'readonly')
          const request = transaction.objectStore('segment-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

        return entries.map((entry) => ({
          buildId: entry.buildId,
          cacheEpoch: entry.cacheEpoch,
          expiresAt: entry.expiresAt,
          key: entry.key,
          kind: entry.kind,
          payload: {
            bodyLength: entry.payload?.body?.byteLength,
            kind: entry.payload?.kind,
            requestKind: entry.payload?.requestKind,
            status: entry.payload?.status,
          },
          segment: entry.segment,
          segmentVaryPath: entry.segmentVaryPath,
          staleAt: entry.staleAt,
          version: entry.version,
        }))
      } finally {
        database.close()
      }
    })
  }

  async function deletePersistedOfflineNavigationEntries(
    browser: Awaited<ReturnType<typeof next.browser>>,
    urlSubstring: string
  ) {
    return browser.eval(async (substring) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 3)
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
        const matchingEntries = entries.filter((entry) =>
          entry.url.includes(substring)
        )

        if (matchingEntries.length === 0) {
          return 0
        }

        const transaction = database.transaction('navigation-data', 'readwrite')
        const store = transaction.objectStore('navigation-data')
        for (const entry of matchingEntries) {
          store.delete([entry.buildId, entry.url])
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })
        return matchingEntries.length
      } finally {
        database.close()
      }
    }, urlSubstring)
  }

  async function cleanupOfflineNavigationState(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
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
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              type?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.find(
            (diagnostic) => diagnostic.type === 'cache-hit'
          )
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
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        const prefetchedRouteRecord = routeRecords.find((record) =>
          record.route.pathname.includes('/prefetched')
        )
        expect(prefetchedRouteRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheEpoch: 0,
            hasMetadata: true,
            hasTree: true,
            kind: 'route',
            route: expect.objectContaining({
              supportsPerSegmentPrefetching: true,
            }),
            routeVaryPath: expect.any(Array),
            version: 1,
          })
        )
      })
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const headRecord = segmentRecords.find(
          (record) => record.segment.requestKey === '/_head'
        )
        const pageRecord = segmentRecords.find(
          (record) =>
            record.segment.requestKey !== '/_head' &&
            record.payload.requestKind === 'segment-prefetch'
        )

        expect(headRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheEpoch: 0,
            kind: 'segment',
            payload: {
              bodyLength: expect.any(Number),
              kind: 'rsc-response',
              requestKind: 'segment-prefetch',
              status: 200,
            },
            segment: expect.objectContaining({
              fetchStrategy: expect.any(Number),
              isPartial: expect.any(Boolean),
              payloadIndex: expect.any(Number),
              requestKey: '/_head',
            }),
            segmentVaryPath: expect.any(Array),
            version: 1,
          })
        )
        expect(headRecord!.payload.bodyLength).toBeGreaterThan(0)

        expect(pageRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheEpoch: 0,
            kind: 'segment',
            payload: {
              bodyLength: expect.any(Number),
              kind: 'rsc-response',
              requestKind: 'segment-prefetch',
              status: 200,
            },
            segment: expect.objectContaining({
              payloadIndex: expect.any(Number),
            }),
            segmentVaryPath: expect.any(Array),
            version: 1,
          })
        )
        expect(pageRecord!.payload.bodyLength).toBeGreaterThan(0)
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
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              type?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.find(
            (diagnostic) => diagnostic.type === 'cache-hit'
          )
        })
      ).toMatchObject({
        type: 'cache-hit',
        requestKind: 'client-resume',
        url: `${next.url}/docs/prefetched`,
      })
      await retry(async () => {
        const hydrationDiagnostic = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              type?: string
              routes?: { hydrated: number; skipped: number }
              segments?: { hydrated: number; skipped: number }
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__
            ?.filter(
              (diagnostic) => diagnostic.type === 'router-cache-hydration'
            )
            .at(-1)
        })
        expect(hydrationDiagnostic).toMatchObject({
          type: 'router-cache-hydration',
          routes: {
            hydrated: expect.any(Number),
            skipped: 0,
          },
          segments: {
            hydrated: expect.any(Number),
            skipped: 0,
          },
        })
        expect(hydrationDiagnostic!.routes!.hydrated).toBeGreaterThan(0)
        expect(hydrationDiagnostic!.segments!.hydrated).toBeGreaterThan(0)
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
            const request = indexedDB.open('next-offline-navigation-cache', 3)
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

      await browser.eval(
        async ({ buildId: entryBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
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
              payload: {
                version: 1,
                kind: 'rsc-response',
                requestKind: 'route-prefetch',
                url,
                status: 200,
                statusText: 'OK',
                headers: [['content-type', 'text/x-component']],
                body: new TextEncoder().encode('0:["$","payload"]').buffer,
              },
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
          url: `${next.url}/docs/unsupported-offline-entry/`,
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

      const unsupportedResponse = await page!.goto(
        `${next.url}/docs/unsupported-offline-entry/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(unsupportedResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.eval(() =>
            document.documentElement.getAttribute(
              'data-next-offline-navigation-cache-reason'
            )
          )
        ).toBe('unsupported-request-kind')
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

  it('reconstructs a fully prefetched route from persisted router records', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

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

      await browser.elementById('prefetch-offline-navigation').click()
      await retry(async () => {
        const exactEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/prefetched'
        )
        expect(exactEntry).toEqual(
          expect.objectContaining({
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'client-resume',
            }),
          })
        )
      })
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes('/prefetched')
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) => record.payload.requestKind === 'segment-prefetch'
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      const deletedExactEntries = await deletePersistedOfflineNavigationEntries(
        browser,
        '/docs/prefetched'
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/prefetched'
        )
        expect(deletedEntry).toBe(null)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const routerCacheOnlyResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(routerCacheOnlyResponse?.status()).toBe(200)
      await retry(async () => {
        const routerCacheDiagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              type?: string
              requestKind?: string
              url?: string
              reason?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(routerCacheDiagnostics).toContainEqual(
          expect.objectContaining({
            type: 'cache-hit',
            requestKind: 'router-cache',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
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

  it('covers exact URL shape and pass-through stress cases', async () => {
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

      const notFoundResponse = await page!.goto(
        `${next.url}/docs/missing-offline-navigation-route/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(notFoundResponse?.status()).toBe(404)
      expect(
        await browser.eval(() =>
          document.documentElement.hasAttribute(
            'data-next-offline-navigation-fallback'
          )
        )
      ).toBe(false)

      const serverErrorResponse = await page!.goto(
        `${next.url}/docs/api/server-error`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(serverErrorResponse?.status()).toBe(500)
      expect(await browser.eval(() => document.body.textContent)).toContain(
        'offline navigation server error'
      )
      expect(
        await browser.eval(() =>
          document.documentElement.hasAttribute(
            'data-next-offline-navigation-fallback'
          )
        )
      ).toBe(false)

      const cachedUrl = `${next.url}/docs/url-stress/space%20value/?token=a%2Bb&tag=one&tag=two#section-1`
      const onlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: space%20value'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: a+b'
        )
        expect(await browser.elementById('url-stress-tags').text()).toBe(
          'url stress tags: one,two'
        )
        expect(await browser.elementById('url-stress-hash').text()).toBe(
          'url stress hash: #section-1'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/url-stress/space%20value/'
        )
        expect(entry).toEqual({
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
          url: `${next.url}/docs/url-stress/space%20value/?token=a%2Bb&tag=one&tag=two`,
          version: 2,
        })
        expect(entry!.payload.bodyLength).toBeGreaterThan(0)
      })

      const rootResponse = await page!.goto(`${next.url}/docs/`, {
        waitUntil: 'domcontentloaded',
      })
      expect(rootResponse?.status()).toBe(200)

      await next.stop()
      await page!.context().setOffline(true)
      const hashVariantResponse = await page!.goto(
        `${next.url}/docs/url-stress/space%20value/?token=a%2Bb&tag=one&tag=two#section-2`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(hashVariantResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: space%20value'
        )
        expect(await browser.elementById('url-stress-hash').text()).toBe(
          'url stress hash: #section-2'
        )
      })
      expect(await browser.elementById('offline-status').text()).toBe('offline')

      const reorderedSearchResponse = await page!.goto(
        `${next.url}/docs/url-stress/space%20value/?tag=one&tag=two&token=a%2Bb#section-3`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(reorderedSearchResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.eval(() =>
            document.documentElement.getAttribute(
              'data-next-offline-navigation-cache-reason'
            )
          )
        ).toBe('missing-entry')
      })
      expect(
        await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<unknown>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.at(-1)
        })
      ).toMatchObject({
        type: 'cache-miss',
        reason: 'missing-entry',
        url: `${next.url}/docs/url-stress/space%20value/?tag=one&tag=two&token=a%2Bb#section-3`,
      })

      const passThroughResults = await browser.eval(async () => {
        const results: Record<string, string> = {}

        for (const [key, input, init] of [
          ['rsc', '/docs?__next_offline_probe=1', { headers: { rsc: '1' } }],
          [
            'post',
            '/docs/api/server-error',
            { method: 'POST', body: 'offline navigation post' },
          ],
        ] as const) {
          try {
            await fetch(input, init)
            results[key] = 'resolved'
          } catch {
            results[key] = 'rejected'
          }
        }

        return results
      })
      expect(passThroughResults).toEqual({
        post: 'rejected',
        rsc: 'rejected',
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      await cleanupOfflineNavigationState(browser)
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
