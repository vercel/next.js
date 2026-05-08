import { existsSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

const OFFLINE_NAVIGATION_FALLBACK_SERVED =
  'next-offline-navigation-fallback-served'
// cachedNavigations changes the runtime cache shape in ways the durable offline
// replay format does not model yet. Keep artifact and service worker coverage
// in that CI mode, but leave replay behavior to standard cache-components runs.
const shouldSkipReplayWithCachedNavigations =
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS === 'true'

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

  async function readPersistedOfflineNavigationMetadata(
    browser: Awaited<ReturnType<typeof next.browser>>,
    key: string
  ) {
    return browser.eval(async (metadataKey) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 3)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      try {
        return await new Promise<unknown>((resolve, reject) => {
          const transaction = database.transaction('metadata', 'readonly')
          const request = transaction.objectStore('metadata').get(metadataKey)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      } finally {
        database.close()
      }
    }, key)
  }

  async function deletePersistedOfflineNavigationSegmentRecords(
    browser: Awaited<ReturnType<typeof next.browser>>,
    options: {
      keySubstring: string
      requestKey?: string
      requestKeySubstring?: string
      requestKeySuffix?: string
    }
  ) {
    return browser.eval(
      async ({
        keySubstring,
        requestKey,
        requestKeySubstring,
        requestKeySuffix,
      }) => {
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
          const matchingEntries = entries.filter(
            (entry) =>
              entry.key.includes(keySubstring) &&
              (requestKey === undefined
                ? (requestKeySubstring === undefined ||
                    entry.segment.requestKey.includes(requestKeySubstring)) &&
                  (requestKeySuffix === undefined ||
                    entry.segment.requestKey.endsWith(requestKeySuffix))
                : entry.segment.requestKey === requestKey)
          )

          if (matchingEntries.length === 0) {
            return 0
          }

          const transaction = database.transaction('segment-data', 'readwrite')
          const store = transaction.objectStore('segment-data')
          for (const entry of matchingEntries) {
            store.delete([entry.buildId, entry.key])
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
      },
      options
    )
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

  async function deletePersistedOfflineNavigationRouteRecords(
    browser: Awaited<ReturnType<typeof next.browser>>,
    pathnameSubstring: string
  ) {
    return browser.eval(async (substring) => {
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
        const matchingEntries = entries.filter((entry) =>
          entry.route.pathname.includes(substring)
        )

        if (matchingEntries.length === 0) {
          return {
            count: 0,
            keys: [],
          }
        }

        const transaction = database.transaction('route-data', 'readwrite')
        const store = transaction.objectStore('route-data')
        for (const entry of matchingEntries) {
          store.delete([entry.buildId, entry.key])
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })

        return {
          count: matchingEntries.length,
          keys: matchingEntries.map((entry) => entry.key),
        }
      } finally {
        database.close()
      }
    }, pathnameSubstring)
  }

  async function expirePersistedOfflineNavigationRouteRecords(
    browser: Awaited<ReturnType<typeof next.browser>>,
    pathnameSubstring: string
  ) {
    return browser.eval(async (substring) => {
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
        const matchingEntries = entries.filter((entry) =>
          entry.route.pathname.includes(substring)
        )

        if (matchingEntries.length === 0) {
          return {
            count: 0,
            expiresAt: null,
            keys: [],
          }
        }

        const expiredAt = Date.now() - 1_000
        const transaction = database.transaction('route-data', 'readwrite')
        const store = transaction.objectStore('route-data')
        for (const entry of matchingEntries) {
          store.put({
            ...entry,
            staleAt: expiredAt,
            expiresAt: expiredAt,
          })
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })

        return {
          count: matchingEntries.length,
          expiresAt: expiredAt,
          keys: matchingEntries.map((entry) => entry.key),
        }
      } finally {
        database.close()
      }
    }, pathnameSubstring)
  }

  async function expirePersistedOfflineNavigationSegmentRecords(
    browser: Awaited<ReturnType<typeof next.browser>>,
    options: {
      keySubstring: string
      requestKeySuffix: string
    }
  ) {
    return browser.eval(async ({ keySubstring, requestKeySuffix }) => {
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
        const matchingEntries = entries.filter(
          (entry) =>
            entry.key.includes(keySubstring) &&
            entry.segment.requestKey.endsWith(requestKeySuffix)
        )

        if (matchingEntries.length === 0) {
          return {
            count: 0,
            expiresAt: null,
            keys: [],
            requestKeys: [],
          }
        }

        const expiredAt = Date.now() - 1_000
        const transaction = database.transaction('segment-data', 'readwrite')
        const store = transaction.objectStore('segment-data')
        for (const entry of matchingEntries) {
          store.put({
            ...entry,
            staleAt: expiredAt,
            expiresAt: expiredAt,
          })
        }
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          transaction.onabort = () => reject(transaction.error)
        })

        return {
          count: matchingEntries.length,
          expiresAt: expiredAt,
          keys: matchingEntries.map((entry) => entry.key),
          requestKeys: matchingEntries.map((entry) => entry.segment.requestKey),
        }
      } finally {
        database.close()
      }
    }, options)
  }

  async function prefetchDynamicPatternReplayData(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    await browser.elementById('prefetch-dynamic-pattern-source').click()
    await retry(async () => {
      const routeRecords =
        await readPersistedOfflineNavigationRouteRecords(browser)
      expect(
        routeRecords.some((record) =>
          record.route.pathname.includes('/dynamic-prefetch/learned')
        )
      ).toBe(true)
    })

    await browser.elementById('prefetch-dynamic-pattern-target').click()
    await retry(async () => {
      const exactEntry = await readPersistedOfflineNavigationEntry(
        browser,
        '/docs/dynamic-prefetch/replayed'
      )
      expect(exactEntry).toBe(null)

      const routeRecords =
        await readPersistedOfflineNavigationRouteRecords(browser)
      expect(
        routeRecords.some((record) =>
          record.route.pathname.includes('/dynamic-prefetch/learned')
        )
      ).toBe(true)
      expect(
        routeRecords.some((record) =>
          record.route.pathname.includes('/dynamic-prefetch/replayed')
        )
      ).toBe(false)

      const segmentRecords =
        await readPersistedOfflineNavigationSegmentRecords(browser)
      const replayedSegmentRecords = segmentRecords.filter((record) =>
        record.key.includes('replayed')
      )
      expect(
        segmentRecords.some(
          (record) => record.payload.requestKind === 'segment-prefetch'
        )
      ).toBe(true)
      expect(
        replayedSegmentRecords.some((record) =>
          record.segment.requestKey.endsWith('/__PAGE__')
        )
      ).toBe(true)
      expect(
        replayedSegmentRecords.some(
          (record) => record.segment.requestKey === '/_head'
        )
      ).toBe(true)
    })
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

  async function waitForOfflineNavigationServiceWorker(
    browser: Awaited<ReturnType<typeof next.browser>>,
    page: Playwright.Page
  ) {
    await retry(
      async () => {
        const state = await browser.eval(async () => {
          if (!('serviceWorker' in navigator)) {
            return {
              controlled: false,
              hasActiveRegistration: false,
            }
          }

          const registrations = await navigator.serviceWorker.getRegistrations()
          return {
            controlled: Boolean(navigator.serviceWorker.controller),
            hasActiveRegistration: registrations.some(
              (registration) =>
                registration.scope.endsWith('/docs/') &&
                registration.active !== null
            ),
          }
        })

        expect(state.hasActiveRegistration).toBe(true)
      },
      10000,
      500
    )

    if (
      !(await browser.eval(() => Boolean(navigator.serviceWorker.controller)))
    ) {
      await page.reload({ waitUntil: 'domcontentloaded' })
    }

    await retry(
      async () => {
        expect(
          await browser.eval(() => Boolean(navigator.serviceWorker.controller))
        ).toBe(true)
      },
      10000,
      500
    )
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
    expect(serviceWorkerScript).toContain('isValidFallbackDocumentResponse')
    expect(serviceWorkerScript).toContain(
      'data-next-offline-navigation-fallback'
    )
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
      await waitForOfflineNavigationServiceWorker(browser, page!)
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
            cacheEpoch: 1,
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
            cacheEpoch: 1,
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
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

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

  it('reconstructs a prefetched workspace shell route from persisted router records', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const exactEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
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
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.payload.requestKind === 'segment-prefetch'
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const workspaceResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(workspaceResponse?.status()).toBe(200)
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
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
      await retry(async () => {
        expect(
          await browser.elementById('workspace-shell-layout-name').text()
        ).toBe('workspace layout: acme')
        expect(await browser.elementById('workspace-thread-page').text()).toBe(
          'workspace thread: acme/general/123'
        )
        expect(
          await browser.elementById('workspace-sidebar-default').text()
        ).toBe('workspace sidebar default')
        expect(
          await browser.elementById('workspace-activity-page').text()
        ).toBe('workspace activity: general/123')
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('restores workspace shell metadata from persisted router records', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const exactEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
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
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.payload.requestKind === 'segment-prefetch'
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const workspaceResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(workspaceResponse?.status()).toBe(200)
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
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
      await retry(async () => {
        expect(await browser.elementById('workspace-thread-page').text()).toBe(
          'workspace thread: acme/general/123'
        )
        expect(await browser.elementById('offline-status').text()).toBe(
          'offline'
        )
        expect(
          await browser.eval(() => ({
            description:
              document
                .querySelector('meta[name="description"]')
                ?.getAttribute('content') ?? null,
            title: document.title,
          }))
        ).toEqual({
          description: 'Offline workspace thread acme/general/123',
          title: 'Workspace acme thread general/123',
        })
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses a workspace shell route when a required default slot record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      const deletedDefaultSlotRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'workspace',
          requestKeySuffix: '/@sidebar/__DEFAULT__',
        })
      expect(deletedDefaultSlotRecords).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(false)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingDefaultSlotResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(missingDefaultSlotResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('workspace-thread-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses a workspace shell route when a required parallel slot record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      const deletedParallelSlotRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'workspace',
          requestKeySubstring: '/@activity/',
          requestKeySuffix: '/__PAGE__',
        })
      expect(deletedParallelSlotRecords).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(false)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingParallelSlotResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(missingParallelSlotResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('workspace-thread-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses a workspace shell route when a required nested layout record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    const workspaceLayoutRequestKey = '/workspace/$d$workspace'
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const segmentRequestKeys = segmentRecords.map(
          (record) => record.segment.requestKey
        )
        expect(segmentRequestKeys).toContain(workspaceLayoutRequestKey)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      const deletedWorkspaceLayoutRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'workspace',
          requestKeySuffix: workspaceLayoutRequestKey,
        })
      expect(deletedWorkspaceLayoutRecords).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const segmentRequestKeys = segmentRecords.map(
          (record) => record.segment.requestKey
        )
        expect(segmentRequestKeys).not.toContain(workspaceLayoutRequestKey)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingWorkspaceLayoutResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(missingWorkspaceLayoutResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('workspace-thread-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses a workspace shell route when the required root layout record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    const workspaceRoute = '/workspace/acme/channel/general/thread/123'
    const workspaceUrlPath = `/docs${workspaceRoute}`
    const rootLayoutRequestKey = ''
    const workspaceLayoutRequestKey = '/workspace/$d$workspace'
    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-workspace-shell').click()
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const segmentRequestKeys = segmentRecords.map(
          (record) => record.segment.requestKey
        )
        expect(segmentRequestKeys).toContain(rootLayoutRequestKey)
        expect(segmentRequestKeys).toContain(workspaceLayoutRequestKey)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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
        workspaceUrlPath
      )
      expect(deletedExactEntries).toBeGreaterThan(0)
      await retry(async () => {
        const deletedEntry = await readPersistedOfflineNavigationEntry(
          browser,
          workspaceUrlPath
        )
        expect(deletedEntry).toBe(null)
      })

      const deletedRootLayoutRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: '',
          requestKey: rootLayoutRequestKey,
        })
      expect(deletedRootLayoutRecords).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes(workspaceRoute)
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const segmentRequestKeys = segmentRecords.map(
          (record) => record.segment.requestKey
        )
        expect(segmentRequestKeys).not.toContain(rootLayoutRequestKey)
        expect(segmentRequestKeys).toContain(workspaceLayoutRequestKey)
        expect(
          segmentRecords.some((record) =>
            record.segment.requestKey.endsWith('/@sidebar/__DEFAULT__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.segment.requestKey.includes('/@activity/') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('workspace') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingRootLayoutResponse = await page!.goto(
        `${next.url}${workspaceUrlPath}`,
        {
          waitUntil: 'domcontentloaded',
        }
      )
      expect(missingRootLayoutResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}${workspaceUrlPath}`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('workspace-thread-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses and deletes expired persisted route records during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      const expiredRouteRecords =
        await expirePersistedOfflineNavigationRouteRecords(
          browser,
          '/prefetched'
        )
      expect(expiredRouteRecords).toEqual({
        count: expect.any(Number),
        expiresAt: expect.any(Number),
        keys: expect.arrayContaining([expect.stringContaining('/prefetched')]),
      })
      expect(expiredRouteRecords.count).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        const prefetchedRouteRecords = routeRecords.filter((record) =>
          record.route.pathname.includes('/prefetched')
        )
        expect(prefetchedRouteRecords).toHaveLength(expiredRouteRecords.count)
        expect(
          prefetchedRouteRecords.every(
            (record) =>
              record.expiresAt === expiredRouteRecords.expiresAt &&
              record.expiresAt <= Date.now()
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const expiredRouteResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(expiredRouteResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes('/prefetched')
          )
        ).toBe(false)
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records when a required route record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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
            (record) =>
              record.key.includes('prefetched') &&
              record.payload.requestKind === 'segment-prefetch'
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

      const deletedRouteRecords =
        await deletePersistedOfflineNavigationRouteRecords(
          browser,
          '/prefetched'
        )
      expect(deletedRouteRecords).toEqual({
        count: expect.any(Number),
        keys: expect.arrayContaining([expect.stringContaining('/prefetched')]),
      })
      expect(deletedRouteRecords.count).toBeGreaterThan(0)
      await retry(async () => {
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes('/prefetched')
          )
        ).toBe(false)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingRouteResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(missingRouteResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('prefetched-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records when a required head record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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

      const deletedHeadRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: '',
          requestKeySuffix: '/_head',
        })
      expect(deletedHeadRecords).toBeGreaterThan(0)
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(false)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingHeadResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(missingHeadResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-head',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('prefetched-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records when a required page segment record is missing during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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

      const deletedPageSegmentRecords =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'prefetched',
          requestKeySuffix: '/__PAGE__',
        })
      expect(deletedPageSegmentRecords).toBeGreaterThan(0)
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(false)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingPageSegmentResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(missingPageSegmentResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('prefetched-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses and deletes expired persisted segment records during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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

      const expiredSegmentRecords =
        await expirePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'prefetched',
          requestKeySuffix: '/__PAGE__',
        })
      expect(expiredSegmentRecords).toEqual({
        count: expect.any(Number),
        expiresAt: expect.any(Number),
        keys: expect.arrayContaining([expect.stringContaining('prefetched')]),
        requestKeys: expect.arrayContaining([
          expect.stringContaining('/__PAGE__'),
        ]),
      })
      expect(expiredSegmentRecords.count).toBeGreaterThan(0)
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const prefetchedPageSegmentRecords = segmentRecords.filter(
          (record) =>
            record.key.includes('prefetched') &&
            record.segment.requestKey.endsWith('/__PAGE__')
        )
        expect(prefetchedPageSegmentRecords).toHaveLength(
          expiredSegmentRecords.count
        )
        expect(
          prefetchedPageSegmentRecords.every(
            (record) =>
              record.expiresAt === expiredSegmentRecords.expiresAt &&
              record.expiresAt <= Date.now()
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const expiredSegmentResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(expiredSegmentResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(false)
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses and deletes expired persisted head records during fallback boot', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
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

      const expiredHeadRecords =
        await expirePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: '',
          requestKeySuffix: '/_head',
        })
      expect(expiredHeadRecords).toEqual({
        count: expect.any(Number),
        expiresAt: expect.any(Number),
        keys: expect.any(Array),
        requestKeys: expect.arrayContaining(['/_head']),
      })
      expect(expiredHeadRecords.count).toBeGreaterThan(0)
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        const headRecords = segmentRecords.filter(
          (record) => record.segment.requestKey === '/_head'
        )
        expect(headRecords).toHaveLength(expiredHeadRecords.count)
        expect(
          headRecords.every(
            (record) =>
              record.expiresAt === expiredHeadRecords.expiresAt &&
              record.expiresAt <= Date.now()
          )
        ).toBe(true)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('prefetched') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const expiredHeadResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(expiredHeadResponse?.status()).toBe(200)

      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-head',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) => record.segment.requestKey === '/_head'
          )
        ).toBe(false)
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after router refresh invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await browser.elementById('refresh-offline-navigation').click()
      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-segment',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after server action invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.elementById('invalidate-offline-navigation-action').click()
      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after redirecting server action invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser
        .elementById('redirect-after-offline-navigation-invalidation')
        .click()
      await retry(async () => {
        expect(page!.url()).toContain('offline-navigation-redirect=1')
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after revalidatePath invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.elementById('revalidate-offline-navigation-path').click()
      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after revalidateTag invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.elementById('revalidate-offline-navigation-tag').click()
      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after cookie mutation invalidation', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.elementById('mutate-offline-navigation-cookie').click()
      await retry(async () => {
        expect(
          await browser.eval(() =>
            document.cookie.includes('offline-navigation-cookie-mutation=')
          )
        ).toBe(true)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted router records after app clears offline navigation cache', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await browser.elementById('prefetch-offline-navigation').click()
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

      await page!.context().setOffline(true)
      const cachedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(cachedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              requestKind?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            requestKind: 'router-cache',
            type: 'cache-hit',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await browser.elementById('clear-offline-navigation-cache').click()
      await retry(async () => {
        expect(
          await browser
            .elementById('clear-offline-navigation-cache-result')
            .text()
        ).toBe('cleared')
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const clearedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(clearedRouterRecordsResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-route',
            type: 'router-cache-reconstruction-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/prefetched`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('replays a dynamic route from persisted known route patterns', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await prefetchDynamicPatternReplayData(browser)

      await next.stop()
      await page!.context().setOffline(true)
      const dynamicReplayResponse = await page!.goto(
        `${next.url}/docs/dynamic-prefetch/replayed#restored`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(dynamicReplayResponse?.status()).toBe(200)
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
            url: `${next.url}/docs/dynamic-prefetch/replayed#restored`,
          })
        )
      })
      await retry(async () => {
        expect(await browser.elementById('dynamic-prefetch-page').text()).toBe(
          'dynamic prefetch path: replayed'
        )
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses dynamic route pattern replay when a required segment record is missing', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await prefetchDynamicPatternReplayData(browser)

      const deletedSegments =
        await deletePersistedOfflineNavigationSegmentRecords(browser, {
          keySubstring: 'replayed',
          requestKeySuffix: '/__PAGE__',
        })
      expect(deletedSegments).toBeGreaterThan(0)
      await retry(async () => {
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('replayed') &&
              record.segment.requestKey.endsWith('/__PAGE__')
          )
        ).toBe(false)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingSegmentResponse = await page!.goto(
        `${next.url}/docs/dynamic-prefetch/replayed#missing-segment`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(missingSegmentResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              type?: string
              reason?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            type: 'router-cache-reconstruction-miss',
            reason: 'missing-segment',
            url: `${next.url}/docs/dynamic-prefetch/replayed#missing-segment`,
          })
        )
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            type: 'cache-miss',
            reason: 'missing-entry',
            url: `${next.url}/docs/dynamic-prefetch/replayed#missing-segment`,
          })
        )
      })
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
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('replays request-sensitive exact URLs from browser-private storage', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

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

  it('misses request-sensitive exact URLs after an app-owned session reset', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

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

      let cachedEntryEpoch = -1
      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/request-sensitive'
        )
        expect(entry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheEpoch: expect.any(Number),
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
              status: 200,
            }),
            url: expect.stringContaining('/docs/request-sensitive'),
          })
        )
        expect(entry!.payload.bodyLength).toBeGreaterThan(0)
        cachedEntryEpoch = entry!.cacheEpoch
      })

      await page!.context().setOffline(true)
      const sameSessionOfflineResponse = await page!.goto(
        `${next.url}/docs/request-sensitive/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(sameSessionOfflineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('request-sensitive-page').text()).toBe(
          'request sensitive session: alpha'
        )
        expect(await browser.elementById('offline-status').text()).toBe(
          'offline'
        )
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })
      const onlineRootResponse = await page!.goto(`${next.url}/docs`, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineRootResponse?.status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.elementById('reset-offline-navigation-session').text()
        ).toBe('Reset offline navigation session')
      })

      await browser.elementById('reset-offline-navigation-session').click()
      await retry(async () => {
        expect(
          await browser
            .elementById('reset-offline-navigation-session-result')
            .text()
        ).toBe('cleared')
        expect(
          await browser.eval(() => document.cookie.includes('offline-session='))
        ).toBe(false)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'exact-url-cache-epoch'
          )
        ).toBeGreaterThan(cachedEntryEpoch)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'route-cache-epoch'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-epoch'
          )
        ).toBeGreaterThan(0)
      })

      await retry(async () => {
        const oldEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/request-sensitive'
        )
        expect(oldEntry).toEqual(
          expect.objectContaining({
            cacheEpoch: cachedEntryEpoch,
            url: expect.stringContaining('/docs/request-sensitive'),
          })
        )
      })

      await page!.context().setOffline(true)
      const resetOfflineResponse = await page!.goto(
        `${next.url}/docs/request-sensitive/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(resetOfflineResponse?.status()).toBe(200)
      await retry(async () => {
        const diagnostics = await browser.eval(() => {
          const win = window as typeof window & {
            __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
              reason?: string
              type?: string
              url?: string
            }>
          }
          return win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ?? []
        })
        expect(diagnostics).toContainEqual(
          expect.objectContaining({
            reason: 'missing-entry',
            type: 'cache-miss',
            url: `${next.url}/docs/request-sensitive/`,
          })
        )
      })
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
        await browser.eval(() =>
          Boolean(document.getElementById('request-sensitive-page'))
        )
      ).toBe(false)
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('covers exact URL shape and pass-through stress cases', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

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

      const passThroughResults = await browser.eval(
        async ({ buildId: currentBuildId, messageType }) => {
          localStorage.removeItem('__nextOfflineNavigationPassThroughMessages')
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === messageType) {
              const messages = JSON.parse(
                localStorage.getItem(
                  '__nextOfflineNavigationPassThroughMessages'
                ) ?? '[]'
              )
              messages.push(event.data)
              localStorage.setItem(
                '__nextOfflineNavigationPassThroughMessages',
                JSON.stringify(messages)
              )
            }
          })

          const requests: Array<[string, string, RequestInit]> = [
            ['rsc', '/docs?__next_offline_probe=1', { headers: { rsc: '1' } }],
            [
              'api-get',
              '/docs/api/server-error?offline-pass-through=1',
              { cache: 'no-store' },
            ],
            [
              'post',
              '/docs/api/server-error',
              { method: 'POST', body: 'offline navigation post' },
            ],
            [
              'static',
              `/docs/_next/static/${currentBuildId}/_offline-navigation-manifest.json?offline-pass-through=1`,
              { cache: 'no-store' },
            ],
          ]
          const results: Record<string, string> = {}

          for (const [key, input, init] of requests) {
            try {
              await fetch(input, init)
              results[key] = 'resolved'
            } catch {
              results[key] = 'rejected'
            }
          }

          return {
            fallbackMessages: JSON.parse(
              localStorage.getItem(
                '__nextOfflineNavigationPassThroughMessages'
              ) ?? '[]'
            ),
            results,
          }
        },
        {
          buildId,
          messageType: OFFLINE_NAVIGATION_FALLBACK_SERVED,
        }
      )
      expect(passThroughResults).toEqual({
        fallbackMessages: [],
        results: {
          'api-get': 'rejected',
          post: 'rejected',
          rsc: 'rejected',
          static: 'rejected',
        },
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

  it('does not serve fallback HTML to offline non-document request shapes', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId } = await getOfflineNavigationArtifactPaths()
    await next.start({ skipBuild: true })

    const requestShapes: Array<{
      expected: {
        accept?: string
        key: string
        method: string
        range?: string
        url: string
      }
      init: RequestInit
      input: string
      key: string
    }> = [
      {
        expected: {
          key: 'head',
          method: 'HEAD',
          url: '/docs/api/server-error?offline-request-shape=head',
        },
        init: { cache: 'no-store', method: 'HEAD' },
        input: '/docs/api/server-error?offline-request-shape=head',
        key: 'head',
      },
      {
        expected: {
          key: 'options',
          method: 'OPTIONS',
          url: '/docs/api/server-error?offline-request-shape=options',
        },
        init: { cache: 'no-store', method: 'OPTIONS' },
        input: '/docs/api/server-error?offline-request-shape=options',
        key: 'options',
      },
      {
        expected: {
          accept: 'text/html',
          key: 'accept-html-fetch',
          method: 'GET',
          url: '/docs/api/server-error?offline-request-shape=accept-html-fetch',
        },
        init: { cache: 'no-store', headers: { accept: 'text/html' } },
        input: '/docs/api/server-error?offline-request-shape=accept-html-fetch',
        key: 'accept-html-fetch',
      },
      {
        expected: {
          key: 'range',
          method: 'GET',
          range: 'bytes=0-16',
          url: `/docs/_next/static/${buildId}/_offline-navigation-manifest.json?offline-request-shape=range`,
        },
        init: { cache: 'no-store', headers: { range: 'bytes=0-16' } },
        input: `/docs/_next/static/${buildId}/_offline-navigation-manifest.json?offline-request-shape=range`,
        key: 'range',
      },
      {
        expected: {
          key: 'delete',
          method: 'DELETE',
          url: '/docs/api/server-error?offline-request-shape=delete',
        },
        init: { cache: 'no-store', method: 'DELETE' },
        input: '/docs/api/server-error?offline-request-shape=delete',
        key: 'delete',
      },
      {
        expected: {
          key: 'post-custom-header',
          method: 'POST',
          url: '/docs/api/server-error?offline-request-shape=post-custom-header',
        },
        init: {
          body: 'offline navigation request shape',
          cache: 'no-store',
          headers: {
            'content-type': 'text/plain',
            'x-offline-navigation-request-shape': '1',
          },
          method: 'POST',
        },
        input:
          '/docs/api/server-error?offline-request-shape=post-custom-header',
        key: 'post-custom-header',
      },
    ]
    let page: Playwright.Page | undefined
    const observedRequests: Array<{
      accept?: string
      key: string
      method: string
      range?: string
      url: string
    }> = []
    const requestShapeParam = 'offline-request-shape'
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const onRequest = (request: Playwright.Request) => {
        const url = new URL(request.url())
        const key = url.searchParams.get(requestShapeParam)
        if (!key) {
          return
        }

        const headers = request.headers()
        const observedRequest: {
          accept?: string
          key: string
          method: string
          range?: string
          url: string
        } = {
          key,
          method: request.method(),
          url: `${url.pathname}?${url.searchParams.toString()}`,
        }
        if (headers.accept) {
          observedRequest.accept = headers.accept
        }
        if (headers.range) {
          observedRequest.range = headers.range
        }
        observedRequests.push(observedRequest)
      }
      page!.on('request', onRequest)

      await page!.context().setOffline(true)
      const passThroughResults = await browser.eval(
        async ({ messageType, requests }) => {
          localStorage.removeItem('__nextOfflineNavigationRequestShapeMessages')
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === messageType) {
              const messages = JSON.parse(
                localStorage.getItem(
                  '__nextOfflineNavigationRequestShapeMessages'
                ) ?? '[]'
              )
              messages.push(event.data)
              localStorage.setItem(
                '__nextOfflineNavigationRequestShapeMessages',
                JSON.stringify(messages)
              )
            }
          })

          const results: Record<string, string> = {}

          for (const { key, input, init } of requests) {
            try {
              await fetch(input, init)
              results[key] = 'resolved'
            } catch {
              results[key] = 'rejected'
            }
          }

          return {
            fallbackMessages: JSON.parse(
              localStorage.getItem(
                '__nextOfflineNavigationRequestShapeMessages'
              ) ?? '[]'
            ),
            results,
          }
        },
        {
          messageType: OFFLINE_NAVIGATION_FALLBACK_SERVED,
          requests: requestShapes,
        }
      )

      page!.off('request', onRequest)

      await retry(async () => {
        expect(observedRequests).toEqual(
          requestShapes.map(({ expected }) => expected)
        )
      })
      expect(passThroughResults).toEqual({
        fallbackMessages: [],
        results: Object.fromEntries(
          requestShapes.map(({ key }) => [key, 'rejected'])
        ),
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('does not fake fallback boot when the cached fallback document is missing', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId } = await getOfflineNavigationArtifactPaths()
    await next.start({ skipBuild: true })

    let page: Playwright.Page | undefined
    const fallbackMessages: Array<unknown> = []
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await page!.exposeFunction(
        '__nextRecordOfflineNavigationCacheDamageMessage',
        (message: unknown) => {
          fallbackMessages.push(message)
        }
      )
      await browser.eval((messageType) => {
        const win = window as typeof window & {
          __nextRecordOfflineNavigationCacheDamageMessage?: (
            message: unknown
          ) => void
        }
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === messageType) {
            win.__nextRecordOfflineNavigationCacheDamageMessage?.(event.data)
          }
        })
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)

      const cacheDamageState = await browser.eval(async (currentBuildId) => {
        const cacheName = `next-offline-navigation-v1:${currentBuildId}:/docs`
        const fallbackPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-fallback.html`
        const manifestPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-manifest.json`
        const cache = await caches.open(cacheName)

        return {
          deletedFallback: await cache.delete(fallbackPath),
          hasFallback: Boolean(await cache.match(fallbackPath)),
          hasManifest: Boolean(await cache.match(manifestPath)),
        }
      }, buildId)
      expect(cacheDamageState).toEqual({
        deletedFallback: true,
        hasFallback: false,
        hasManifest: true,
      })

      await page!.context().setOffline(true)
      let navigationError: string | null = null
      try {
        await page!.goto(
          `${next.url}/docs/prefetched?missing-fallback-cache=1`,
          { waitUntil: 'domcontentloaded' }
        )
      } catch (error) {
        navigationError = String(error)
      }

      expect(navigationError).toMatch(
        /ERR_FAILED|ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|offline/i
      )
      expect(fallbackMessages).toEqual([])
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('does not fake fallback boot when the cached fallback document is corrupted', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    const { buildId } = await getOfflineNavigationArtifactPaths()
    await next.start({ skipBuild: true })

    let page: Playwright.Page | undefined
    const fallbackMessages: Array<unknown> = []
    try {
      const browser = await next.browser('/docs', {
        beforePageLoad(p: Playwright.Page) {
          page = p
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await page!.exposeFunction(
        '__nextRecordOfflineNavigationCacheDamageMessage',
        (message: unknown) => {
          fallbackMessages.push(message)
        }
      )
      await browser.eval((messageType) => {
        const win = window as typeof window & {
          __nextRecordOfflineNavigationCacheDamageMessage?: (
            message: unknown
          ) => void
        }
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === messageType) {
            win.__nextRecordOfflineNavigationCacheDamageMessage?.(event.data)
          }
        })
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)

      const cacheDamageState = await browser.eval(async (currentBuildId) => {
        const cacheName = `next-offline-navigation-v1:${currentBuildId}:/docs`
        const fallbackPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-fallback.html`
        const manifestPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-manifest.json`
        const cache = await caches.open(cacheName)
        const originalFallback = await cache.match(fallbackPath)

        await cache.put(
          fallbackPath,
          new Response(
            '<!doctype html><p id="corrupted-offline-fallback">corrupted offline fallback</p>',
            {
              headers: {
                'content-type': 'text/html; charset=utf-8',
              },
            }
          )
        )

        const damagedFallback = await cache.match(fallbackPath)
        const damagedFallbackText = await damagedFallback?.text()

        return {
          damagedFallbackText,
          hadFallback: Boolean(originalFallback),
          hasManifest: Boolean(await cache.match(manifestPath)),
        }
      }, buildId)
      expect(cacheDamageState).toEqual({
        damagedFallbackText:
          '<!doctype html><p id="corrupted-offline-fallback">corrupted offline fallback</p>',
        hadFallback: true,
        hasManifest: true,
      })

      await page!.context().setOffline(true)
      let navigationError: string | null = null
      try {
        await page!.goto(
          `${next.url}/docs/prefetched?corrupted-fallback-cache=1`,
          { waitUntil: 'domcontentloaded' }
        )
      } catch (error) {
        navigationError = String(error)
      }

      expect(navigationError).toMatch(
        /ERR_FAILED|ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|offline/i
      )
      expect(fallbackMessages).toEqual([])
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('serves fallback HTML when the cached manifest is missing or corrupted', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

    for (const manifestDamage of [
      {
        kind: 'missing',
        targetPath: '/docs/prefetched?missing-manifest-cache=1',
      },
      {
        kind: 'corrupted',
        targetPath: '/docs/prefetched?corrupted-manifest-cache=1',
      },
    ]) {
      const buildResult = await next.build()
      expect(buildResult.exitCode).toBe(0)

      const { buildId } = await getOfflineNavigationArtifactPaths()
      await next.start({ skipBuild: true })

      let page: Playwright.Page | undefined
      try {
        const browser = await next.browser('/docs', {
          beforePageLoad(p: Playwright.Page) {
            page = p
          },
        })
        await waitForOfflineNavigationServiceWorker(browser, page!)

        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe(
            'offline navigations page'
          )
        })

        const fallbackMessageStorageKey = `__nextOfflineNavigationManifestDamageMessages:${manifestDamage.kind}`
        await browser.eval(
          ({ messageType, storageKey }) => {
            localStorage.removeItem(storageKey)
            navigator.serviceWorker.addEventListener('message', (event) => {
              if (event.data?.type === messageType) {
                const messages = JSON.parse(
                  localStorage.getItem(storageKey) ?? '[]'
                )
                messages.push(event.data)
                localStorage.setItem(storageKey, JSON.stringify(messages))
              }
            })
          },
          {
            messageType: OFFLINE_NAVIGATION_FALLBACK_SERVED,
            storageKey: fallbackMessageStorageKey,
          }
        )

        const cacheDamageState = await browser.eval(
          async ({ currentBuildId, damageKind }) => {
            const cacheName = `next-offline-navigation-v1:${currentBuildId}:/docs`
            const fallbackPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-fallback.html`
            const manifestPath = `/docs/_next/static/${currentBuildId}/_offline-navigation-manifest.json`
            const cache = await caches.open(cacheName)
            const originalManifest = await cache.match(manifestPath)

            if (damageKind === 'missing') {
              await cache.delete(manifestPath)
            } else {
              await cache.put(
                manifestPath,
                new Response('{"corruptedOfflineNavigationManifest":true}', {
                  headers: {
                    'content-type': 'application/json',
                  },
                })
              )
            }

            const damagedManifest = await cache.match(manifestPath)

            return {
              damagedManifestText:
                damagedManifest === undefined
                  ? null
                  : await damagedManifest.text(),
              hadManifest: Boolean(originalManifest),
              hasFallback: Boolean(await cache.match(fallbackPath)),
            }
          },
          {
            currentBuildId: buildId,
            damageKind: manifestDamage.kind,
          }
        )
        expect(cacheDamageState).toEqual({
          damagedManifestText:
            manifestDamage.kind === 'missing'
              ? null
              : '{"corruptedOfflineNavigationManifest":true}',
          hadManifest: true,
          hasFallback: true,
        })

        await page!.context().setOffline(true)
        const targetUrl = `${next.url}${manifestDamage.targetPath}`
        const offlineResponse = await page!.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
        })
        expect(offlineResponse?.status()).toBe(200)

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
          await browser.eval((storageKey) => {
            const cacheMiss = document.getElementById(
              '__NEXT_OFFLINE_NAVIGATION_CACHE_MISS'
            )
            const win = window as typeof window & {
              __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<unknown>
            }

            return {
              cache: document.documentElement.getAttribute(
                'data-next-offline-navigation-cache'
              ),
              diagnostic:
                win.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.at(-1) ?? null,
              fallback: document.documentElement.hasAttribute(
                'data-next-offline-navigation-fallback'
              ),
              fallbackMessages: JSON.parse(
                localStorage.getItem(storageKey) ?? '[]'
              ),
              miss:
                cacheMiss === null
                  ? null
                  : {
                      hidden: cacheMiss.hidden,
                      reason: cacheMiss.getAttribute(
                        'data-next-offline-navigation-cache-reason'
                      ),
                      text: cacheMiss.textContent,
                    },
            }
          }, fallbackMessageStorageKey)
        ).toMatchObject({
          cache: 'miss',
          diagnostic: {
            reason: 'missing-entry',
            type: 'cache-miss',
            url: targetUrl,
          },
          fallback: true,
          fallbackMessages: [
            {
              buildId,
              reason: 'network-error',
              type: OFFLINE_NAVIGATION_FALLBACK_SERVED,
              url: targetUrl,
            },
          ],
          miss: {
            hidden: false,
            reason: 'missing-entry',
            text: 'This page is not available offline.',
          },
        })
      } finally {
        if (page) {
          await page.context().setOffline(false)
        }
        await next.stop()
      }
    }
  })

  it('does not serve fallback HTML to offline server action submissions', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.eval((messageType) => {
        localStorage.removeItem('__nextOfflineNavigationActionMessages')
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === messageType) {
            const messages = JSON.parse(
              localStorage.getItem('__nextOfflineNavigationActionMessages') ??
                '[]'
            )
            messages.push(event.data)
            localStorage.setItem(
              '__nextOfflineNavigationActionMessages',
              JSON.stringify(messages)
            )
          }
        })
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)

      const failedActionRequest = page!.waitForEvent('requestfailed', {
        predicate(request) {
          return (
            request.method() === 'POST' &&
            request.url().startsWith(`${next.url}/docs`)
          )
        },
      })

      await page!.context().setOffline(true)
      await browser.elementById('invalidate-offline-navigation-action').click()

      const request = await failedActionRequest
      expect(request.failure()?.errorText).toMatch(
        /ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|offline/i
      )

      expect(
        await browser.eval(() => ({
          cache: document.documentElement.getAttribute(
            'data-next-offline-navigation-cache'
          ),
          fallback: document.documentElement.hasAttribute(
            'data-next-offline-navigation-fallback'
          ),
          fallbackMessages: JSON.parse(
            localStorage.getItem('__nextOfflineNavigationActionMessages') ??
              '[]'
          ),
          marker:
            document.getElementById('action-invalidation-marker')
              ?.textContent ?? null,
          miss:
            document.getElementById('__NEXT_OFFLINE_NAVIGATION_CACHE_MISS') ===
            null
              ? null
              : 'present',
          pageText: document.querySelector('p')?.textContent ?? null,
        }))
      ).toEqual({
        cache: null,
        fallback: false,
        fallbackMessages: [],
        marker: 'action invalidation marker',
        miss: null,
        pageText: 'offline navigations page',
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('does not serve fallback HTML to offline redirecting server action submissions', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
        expect(
          await browser.elementById('action-invalidation-marker').text()
        ).toBe('action invalidation marker')
      })

      await browser.eval((messageType) => {
        localStorage.removeItem('__nextOfflineNavigationRedirectActionMessages')
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data?.type === messageType) {
            const messages = JSON.parse(
              localStorage.getItem(
                '__nextOfflineNavigationRedirectActionMessages'
              ) ?? '[]'
            )
            messages.push(event.data)
            localStorage.setItem(
              '__nextOfflineNavigationRedirectActionMessages',
              JSON.stringify(messages)
            )
          }
        })
      }, OFFLINE_NAVIGATION_FALLBACK_SERVED)

      const failedActionRequest = page!.waitForEvent('requestfailed', {
        predicate(request) {
          return (
            request.method() === 'POST' &&
            request.url().startsWith(`${next.url}/docs`)
          )
        },
      })

      await page!.context().setOffline(true)
      await browser
        .elementById('redirect-after-offline-navigation-invalidation')
        .click()

      const request = await failedActionRequest
      expect(request.failure()?.errorText).toMatch(
        /ERR_INTERNET_DISCONNECTED|NS_ERROR_OFFLINE|offline/i
      )

      expect(
        await browser.eval(() => ({
          cache: document.documentElement.getAttribute(
            'data-next-offline-navigation-cache'
          ),
          fallback: document.documentElement.hasAttribute(
            'data-next-offline-navigation-fallback'
          ),
          fallbackMessages: JSON.parse(
            localStorage.getItem(
              '__nextOfflineNavigationRedirectActionMessages'
            ) ?? '[]'
          ),
          marker:
            document.getElementById('action-invalidation-marker')
              ?.textContent ?? null,
          miss:
            document.getElementById('__NEXT_OFFLINE_NAVIGATION_CACHE_MISS') ===
            null
              ? null
              : 'present',
          pageText: document.querySelector('p')?.textContent ?? null,
          search: location.search,
        }))
      ).toEqual({
        cache: null,
        fallback: false,
        fallbackMessages: [],
        marker: 'action invalidation marker',
        miss: null,
        pageText: 'offline navigations page',
        search: '',
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('does not serve fallback HTML to offline form POST navigations', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await browser.eval(
        ({ action, messageType }) => {
          localStorage.removeItem('__nextOfflineNavigationFormMessages')
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === messageType) {
              const messages = JSON.parse(
                localStorage.getItem('__nextOfflineNavigationFormMessages') ??
                  '[]'
              )
              messages.push(event.data)
              localStorage.setItem(
                '__nextOfflineNavigationFormMessages',
                JSON.stringify(messages)
              )
            }
          })

          const iframe = document.createElement('iframe')
          iframe.hidden = true
          iframe.id = 'offline-navigation-form-target'
          iframe.name = 'offline-navigation-form-target'
          document.body.appendChild(iframe)

          const form = document.createElement('form')
          form.action = action
          form.id = 'offline-navigation-form-post'
          form.method = 'post'
          form.target = iframe.name

          const input = document.createElement('input')
          input.name = 'offline-navigation-form-value'
          input.value = 'offline navigation form post'
          form.appendChild(input)

          const button = document.createElement('button')
          button.id = 'offline-navigation-form-submit'
          button.type = 'submit'
          button.textContent = 'Submit offline navigation form'
          form.appendChild(button)

          document.body.appendChild(form)
        },
        {
          action: `${next.url}/docs/api/server-error`,
          messageType: OFFLINE_NAVIGATION_FALLBACK_SERVED,
        }
      )

      const formPostUrl = `${next.url}/docs/api/server-error`
      const formPostRequest = page!.waitForEvent('request', {
        predicate(request) {
          return (
            request.method() === 'POST' && request.url().startsWith(formPostUrl)
          )
        },
      })

      await page!.context().setOffline(true)
      await browser.eval(() => {
        const form = document.getElementById(
          'offline-navigation-form-post'
        ) as HTMLFormElement
        form.requestSubmit()
      })

      const postedRequest = await formPostRequest
      expect(postedRequest.method()).toBe('POST')
      expect(postedRequest.url()).toContain('/docs/api/server-error')

      expect(
        await browser.eval((targetUrl) => {
          const iframe = document.getElementById(
            'offline-navigation-form-target'
          ) as HTMLIFrameElement | null
          let iframeUrl: string | null = null

          try {
            iframeUrl = iframe?.contentWindow?.location.href ?? null
          } catch {
            iframeUrl = 'inaccessible'
          }

          return {
            fallbackMessages: JSON.parse(
              localStorage.getItem('__nextOfflineNavigationFormMessages') ??
                '[]'
            ),
            iframeReachedTarget: iframeUrl === targetUrl,
            pageText: document.querySelector('p')?.textContent ?? null,
          }
        }, formPostUrl)
      ).toEqual({
        fallbackMessages: [],
        iframeReachedTarget: false,
        pageText: 'offline navigations page',
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('does not reach route handler mutation side effects while offline', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })

      await browser.eval(
        ({ action, messageType }) => {
          document.cookie =
            'offline-navigation-route-mutation=; Max-Age=0; path=/'
          localStorage.removeItem('__nextOfflineNavigationRouteHandlerMessages')
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === messageType) {
              const messages = JSON.parse(
                localStorage.getItem(
                  '__nextOfflineNavigationRouteHandlerMessages'
                ) ?? '[]'
              )
              messages.push(event.data)
              localStorage.setItem(
                '__nextOfflineNavigationRouteHandlerMessages',
                JSON.stringify(messages)
              )
            }
          })

          const iframe = document.createElement('iframe')
          iframe.hidden = true
          iframe.id = 'offline-navigation-route-handler-target'
          iframe.name = 'offline-navigation-route-handler-target'
          document.body.appendChild(iframe)

          const form = document.createElement('form')
          form.action = action
          form.id = 'offline-navigation-route-handler-form'
          form.method = 'post'
          form.target = iframe.name

          const input = document.createElement('input')
          input.name = 'offline-navigation-route-handler-value'
          input.value = 'offline navigation route handler mutation'
          form.appendChild(input)

          document.body.appendChild(form)
        },
        {
          action: `${next.url}/docs/api/offline-mutation/`,
          messageType: OFFLINE_NAVIGATION_FALLBACK_SERVED,
        }
      )

      const mutationUrl = `${next.url}/docs/api/offline-mutation/`
      const offlineMutationRequest = page!.waitForEvent('request', {
        predicate(request) {
          return (
            request.method() === 'POST' && request.url().startsWith(mutationUrl)
          )
        },
      })

      await page!.context().setOffline(true)
      await browser.eval(() => {
        const form = document.getElementById(
          'offline-navigation-route-handler-form'
        ) as HTMLFormElement
        form.requestSubmit()
      })

      const request = await offlineMutationRequest
      expect(request.method()).toBe('POST')
      expect(request.url()).toContain('/docs/api/offline-mutation')

      expect(
        await browser.eval((targetUrl) => {
          const iframe = document.getElementById(
            'offline-navigation-route-handler-target'
          ) as HTMLIFrameElement | null
          let iframeUrl: string | null = null

          try {
            iframeUrl = iframe?.contentWindow?.location.href ?? null
          } catch {
            iframeUrl = 'inaccessible'
          }

          return {
            cookie: document.cookie.includes(
              'offline-navigation-route-mutation=online'
            ),
            fallbackMessages: JSON.parse(
              localStorage.getItem(
                '__nextOfflineNavigationRouteHandlerMessages'
              ) ?? '[]'
            ),
            iframeReachedTarget: iframeUrl === targetUrl,
            pageText: document.querySelector('p')?.textContent ?? null,
          }
        }, mutationUrl)
      ).toEqual({
        cookie: false,
        fallbackMessages: [],
        iframeReachedTarget: false,
        pageText: 'offline navigations page',
      })

      await page!.context().setOffline(false)
      await browser.eval(() => {
        window.dispatchEvent(new Event('online'))
      })

      const onlineMutationResponse = page!.waitForResponse((response) => {
        return (
          response.request().method() === 'POST' &&
          response.url().startsWith(mutationUrl)
        )
      })
      await browser.eval(() => {
        const form = document.getElementById(
          'offline-navigation-route-handler-form'
        ) as HTMLFormElement
        form.requestSubmit()
      })

      expect((await onlineMutationResponse).status()).toBe(200)
      await retry(async () => {
        expect(
          await browser.eval(() =>
            document.cookie.includes('offline-navigation-route-mutation=online')
          )
        ).toBe(true)
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL replay for query identity collision variants', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const cachedUrl = `${next.url}/docs/url-stress/space%20value/?token=a%2Bb&tag=one&tag=two`
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
          url: cachedUrl,
          version: 2,
        })
      })

      const collisionVariants = [
        {
          name: 'plus-as-space',
          url: `${next.url}/docs/url-stress/space%20value/?token=a+b&tag=one&tag=two`,
        },
        {
          name: 'duplicate-param-order',
          url: `${next.url}/docs/url-stress/space%20value/?token=a%2Bb&tag=two&tag=one`,
        },
      ]

      await next.stop()
      await page!.context().setOffline(true)

      for (const variant of collisionVariants) {
        const response = await page!.goto(variant.url, {
          waitUntil: 'domcontentloaded',
        })
        expect(response?.status()).toBe(200)

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
            renderedRoute:
              document.getElementById('url-stress-page')?.textContent ?? null,
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
          renderedRoute: null,
          diagnostic: {
            type: 'cache-miss',
            buildId: navigationBuildId,
            reason: 'missing-entry',
            url: variant.url,
          },
        })
      }
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL replay for encoded path identity collision variants', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const cachedUrl = `${next.url}/docs/url-stress/a%2Bb/?token=encoded-path`
      const onlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: a%2Bb'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: encoded-path'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/url-stress/a%2Bb/'
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
          url: cachedUrl,
          version: 2,
        })
      })

      const pathCollisionUrl = `${next.url}/docs/url-stress/a+b/?token=encoded-path`

      await next.stop()
      await page!.context().setOffline(true)

      const response = await page!.goto(pathCollisionUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          renderedRoute:
            document.getElementById('url-stress-page')?.textContent ?? null,
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
        renderedRoute: null,
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: pathCollisionUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL replay for encoded slash path identity variants', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const cachedUrl = `${next.url}/docs/url-stress/a%2Fb/?token=encoded-slash`
      const onlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: a%2Fb'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: encoded-slash'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/url-stress/a%2Fb/'
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
          url: cachedUrl,
          version: 2,
        })
      })

      const pathCollisionUrl = `${next.url}/docs/url-stress/a/b/?token=encoded-slash`

      await next.stop()
      await page!.context().setOffline(true)

      const response = await page!.goto(pathCollisionUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          renderedRoute:
            document.getElementById('url-stress-page')?.textContent ?? null,
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
        renderedRoute: null,
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: pathCollisionUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL replay for path case identity collision variants', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const cachedUrl = `${next.url}/docs/url-stress/CaseValue/?token=case-path`
      const onlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: CaseValue'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: case-path'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/url-stress/CaseValue/'
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
          url: cachedUrl,
          version: 2,
        })
      })

      const pathCollisionUrl = `${next.url}/docs/url-stress/casevalue/?token=case-path`

      await next.stop()
      await page!.context().setOffline(true)

      const response = await page!.goto(pathCollisionUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          renderedRoute:
            document.getElementById('url-stress-page')?.textContent ?? null,
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
        renderedRoute: null,
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: pathCollisionUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('replays exact-URL data for trailing-slash normalized variants', async () => {
    if (shouldSkipReplayWithCachedNavigations) {
      return
    }

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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      const cachedUrl = `${next.url}/docs/url-stress/trailing-slash/?token=trailing-slash`
      const onlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(onlineResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: trailing-slash'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: trailing-slash'
        )
      })

      await retry(async () => {
        const entry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/url-stress/trailing-slash/'
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
          url: cachedUrl,
          version: 2,
        })
      })

      const noSlashVariantUrl = `${next.url}/docs/url-stress/trailing-slash?token=trailing-slash`

      await next.stop()
      await page!.context().setOffline(true)

      const response = await page!.goto(noSlashVariantUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

      await retry(async () => {
        expect(await browser.elementById('url-stress-page').text()).toBe(
          'url stress path: trailing-slash'
        )
        expect(await browser.elementById('url-stress-token').text()).toBe(
          'url stress token: trailing-slash'
        )
      })
      expect(await browser.elementById('offline-status').text()).toBe('offline')

      expect(
        await browser.eval(() => ({
          cacheMiss:
            document.getElementById('__NEXT_OFFLINE_NAVIGATION_CACHE_MISS') ===
            null
              ? null
              : 'present',
          renderedRoute:
            document.getElementById('url-stress-page')?.textContent ?? null,
          diagnostic:
            (
              window as typeof window & {
                __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?: Array<{
                  type?: string
                }>
              }
            ).__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?.find(
              (diagnostic) => diagnostic.type === 'cache-hit'
            ) ?? null,
        }))
      ).toMatchObject({
        cacheMiss: null,
        renderedRoute: 'url stress path: trailing-slash',
        diagnostic: {
          type: 'cache-hit',
          buildId: navigationBuildId,
          requestKind: 'initial-load',
          url: noSlashVariantUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('shows cache miss when IndexedDB is unavailable during fallback boot', async () => {
    const buildResult = await next.build()
    expect(buildResult.exitCode).toBe(0)

    await next.start({ skipBuild: true })

    let page: Playwright.Page | undefined
    try {
      const browser = await next.browser('/docs', {
        async beforePageLoad(p: Playwright.Page) {
          page = p
          await p.addInitScript(() => {
            Object.defineProperty(window, 'indexedDB', {
              configurable: true,
              value: undefined,
            })
          })
        },
      })
      await waitForOfflineNavigationServiceWorker(browser, page!)
      expect(await browser.eval(() => typeof indexedDB)).toBe('undefined')

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(`${next.url}/docs/idb-unavailable/`, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

      await retry(async () => {
        expect(
          await browser.eval(() => {
            const cacheMiss = document.getElementById(
              '__NEXT_OFFLINE_NAVIGATION_CACHE_MISS'
            )
            return cacheMiss === null
              ? null
              : {
                  fallback: document.documentElement.hasAttribute(
                    'data-next-offline-navigation-fallback'
                  ),
                  hidden: cacheMiss.hidden,
                  reason: cacheMiss.getAttribute(
                    'data-next-offline-navigation-cache-reason'
                  ),
                  text: cacheMiss.textContent,
                }
          })
        ).toEqual({
          fallback: true,
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
          url: `${next.url}/docs/idb-unavailable/`,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('ignores persisted offline navigation data from another build', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const staleEntry = await browser.eval(
        async ({ currentBuildId, staleUrl }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const staleBuildId = `${currentBuildId}:stale`
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              buildId: staleBuildId,
              url: staleUrl,
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: staleBuildId,
              url: staleUrl,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          staleUrl: `${next.url}/docs/stale-build/`,
        }
      )
      expect(staleEntry).toEqual({
        buildId: `${navigationBuildId}:stale`,
        url: `${next.url}/docs/stale-build/`,
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(`${next.url}/docs/stale-build/`, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: `${next.url}/docs/stale-build/`,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL data with a missing RSC response body during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const missingBodyUrl = `${next.url}/docs/missing-body-offline-entry/`
      const missingBodyEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              buildId: currentBuildId,
              url,
              payload: {
                ...sourceEntry.payload,
                url,
                body: null,
              },
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: currentBuildId,
              payloadBody: null,
              payloadKind: sourceEntry.payload.kind,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: missingBodyUrl,
        }
      )
      expect(missingBodyEntry).toEqual({
        buildId: navigationBuildId,
        payloadBody: null,
        payloadKind: 'rsc-response',
        url: missingBodyUrl,
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(missingBodyUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          reason: 'invalid-payload',
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
        reason: 'invalid-payload',
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'invalid-payload',
          url: missingBodyUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL data with an incompatible RSC response payload version during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const incompatiblePayloadUrl = `${next.url}/docs/incompatible-payload-version-offline-entry/`
      const incompatiblePayloadEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const payloadVersion = 999
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              buildId: currentBuildId,
              url,
              payload: {
                ...sourceEntry.payload,
                url,
                version: payloadVersion,
              },
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: currentBuildId,
              payloadKind: sourceEntry.payload.kind,
              payloadVersion,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: incompatiblePayloadUrl,
        }
      )
      expect(incompatiblePayloadEntry).toEqual({
        buildId: navigationBuildId,
        payloadKind: 'rsc-response',
        payloadVersion: 999,
        url: incompatiblePayloadUrl,
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(incompatiblePayloadUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          reason: 'invalid-payload',
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
        reason: 'invalid-payload',
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'invalid-payload',
          url: incompatiblePayloadUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses and deletes exact-URL data with an incompatible entry version during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const incompatibleEntryUrl = `${next.url}/docs/incompatible-entry-version-offline-entry/`
      const incompatibleEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const entryVersion = 999
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              version: entryVersion,
              buildId: currentBuildId,
              url,
              payload: {
                ...sourceEntry.payload,
                url,
              },
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: currentBuildId,
              entryVersion,
              payloadKind: sourceEntry.payload.kind,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: incompatibleEntryUrl,
        }
      )
      expect(incompatibleEntry).toEqual({
        buildId: navigationBuildId,
        entryVersion: 999,
        payloadKind: 'rsc-response',
        url: incompatibleEntryUrl,
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(incompatibleEntryUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: incompatibleEntryUrl,
        },
      })

      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationEntry(
            browser,
            '/docs/incompatible-entry-version-offline-entry/'
          )
        ).toBe(null)
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses exact-URL data with a malformed RSC response body during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const malformedBodyUrl = `${next.url}/docs/malformed-rsc-body-offline-entry/`
      const malformedBodyEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const malformedBody = new TextEncoder().encode(
              '0:{"unterminated"\n'
            )
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              buildId: currentBuildId,
              url,
              payload: {
                ...sourceEntry.payload,
                url,
                body: malformedBody.buffer,
              },
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              bodyLength: malformedBody.byteLength,
              buildId: currentBuildId,
              payloadKind: sourceEntry.payload.kind,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: malformedBodyUrl,
        }
      )
      expect(malformedBodyEntry).toEqual({
        bodyLength: expect.any(Number),
        buildId: navigationBuildId,
        payloadKind: 'rsc-response',
        url: malformedBodyUrl,
      })
      expect(malformedBodyEntry!.bodyLength).toBeGreaterThan(0)

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(malformedBodyUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          reason: 'invalid-payload',
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
        reason: 'invalid-payload',
        diagnostic: {
          type: 'cache-miss',
          buildId: navigationBuildId,
          reason: 'invalid-payload',
          url: malformedBodyUrl,
        },
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('replays stale-but-not-expired exact-URL data during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const staleUrl = `${next.url}/docs/stale-but-replayable-offline-entry/`
      const staleEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find(
              (entry) =>
                entry.buildId === currentBuildId && entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const staleAt = Date.now() - 1_000
            const expiresAt = Date.now() + 60_000
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              url,
              staleAt,
              expiresAt,
              payload: {
                ...sourceEntry.payload,
                url,
              },
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: currentBuildId,
              expiresAt,
              staleAt,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: staleUrl,
        }
      )
      expect(staleEntry).toEqual({
        buildId: navigationBuildId,
        expiresAt: expect.any(Number),
        staleAt: expect.any(Number),
        url: staleUrl,
      })
      expect(staleEntry!.staleAt).toBeLessThan(Date.now())
      expect(staleEntry!.expiresAt).toBeGreaterThan(Date.now())

      const awayResponse = await page!.goto(`${next.url}/docs/prefetched`, {
        waitUntil: 'domcontentloaded',
      })
      expect(awayResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('prefetched-page').text()).toBe(
          'prefetched page'
        )
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(staleUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

      await retry(async () => {
        expect(await browser.elementByCss('p').text()).toBe(
          'offline navigations page'
        )
      })
      await retry(async () => {
        expect(await browser.elementById('offline-status').text()).toBe(
          'offline'
        )
      })

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
        buildId: navigationBuildId,
        requestKind: 'initial-load',
        url: staleUrl,
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses and deletes expired persisted exact-URL data during fallback boot', async () => {
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
      await waitForOfflineNavigationServiceWorker(browser, page!)

      await retry(async () => {
        const initialLoadEntry = await readPersistedOfflineNavigationEntry(
          browser,
          '/docs/'
        )
        expect(initialLoadEntry).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            kind: 'exact-url',
            payload: expect.objectContaining({
              kind: 'rsc-response',
              requestKind: 'initial-load',
            }),
          })
        )
      })

      const expiredUrl = `${next.url}/docs/expired-offline-entry/`
      const expiredEntry = await browser.eval(
        async ({ currentBuildId, url }) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('next-offline-navigation-cache', 3)
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })

          try {
            const readTransaction = database.transaction(
              'navigation-data',
              'readonly'
            )
            const entries = await new Promise<any[]>((resolve, reject) => {
              const request = readTransaction
                .objectStore('navigation-data')
                .getAll()
              request.onsuccess = () => resolve(request.result)
              request.onerror = () => reject(request.error)
            })
            const sourceEntry = entries.find((entry) =>
              entry.url.endsWith('/docs/')
            )
            if (!sourceEntry) {
              return null
            }

            const expiredAt = Date.now() - 1_000
            const writeTransaction = database.transaction(
              'navigation-data',
              'readwrite'
            )
            writeTransaction.objectStore('navigation-data').put({
              ...sourceEntry,
              buildId: currentBuildId,
              url,
              staleAt: expiredAt,
              expiresAt: expiredAt,
            })
            await new Promise<void>((resolve, reject) => {
              writeTransaction.oncomplete = () => resolve()
              writeTransaction.onerror = () => reject(writeTransaction.error)
              writeTransaction.onabort = () => reject(writeTransaction.error)
            })

            return {
              buildId: currentBuildId,
              expiresAt: expiredAt,
              url,
            }
          } finally {
            database.close()
          }
        },
        {
          currentBuildId: navigationBuildId,
          url: expiredUrl,
        }
      )
      expect(expiredEntry).toEqual({
        buildId: navigationBuildId,
        expiresAt: expect.any(Number),
        url: expiredUrl,
      })

      await next.stop()
      await page!.context().setOffline(true)
      const response = await page!.goto(expiredUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(response?.status()).toBe(200)

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
          buildId: navigationBuildId,
          reason: 'missing-entry',
          url: expiredUrl,
        },
      })

      await retry(async () => {
        expect(
          await readPersistedOfflineNavigationEntry(
            browser,
            '/docs/expired-offline-entry/'
          )
        ).toBe(null)
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
