import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

const OFFLINE_NAVIGATION_FALLBACK_SERVED =
  'next-offline-navigation-fallback-served'

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

  function getStaticClientChunkFiles(directory: string): string[] {
    if (!existsSync(directory)) {
      return []
    }

    return readdirSync(directory).flatMap((entry) => {
      const absolutePath = join(directory, entry)
      const stat = statSync(absolutePath)
      if (stat.isDirectory()) {
        return getStaticClientChunkFiles(absolutePath)
      }
      return absolutePath.endsWith('.js') ? [absolutePath] : []
    })
  }

  function getStaticClientChunkForbiddenMatches(
    directory: string,
    forbidden: string[]
  ): Array<{ file: string; token: string; snippet: string }> {
    const matches: Array<{ file: string; token: string; snippet: string }> = []
    for (const file of getStaticClientChunkFiles(directory)) {
      const contents = readFileSync(file, 'utf8')
      for (const token of forbidden) {
        const index = contents.indexOf(token)
        if (index === -1) {
          continue
        }
        matches.push({
          file,
          token,
          snippet: contents.slice(
            Math.max(0, index - 120),
            Math.min(contents.length, index + token.length + 120)
          ),
        })
      }
    }
    return matches
  }

  async function readPersistedOfflineNavigationRouteRecords(
    browser: Awaited<ReturnType<typeof next.browser>>
  ) {
    return browser.eval(async () => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 1)
        request.onupgradeneeded = () => {
          const database = request.result
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
          const transaction = database.transaction('route-data', 'readonly')
          const request = transaction.objectStore('route-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

        return entries.map((entry) => ({
          buildId: entry.buildId,
          cacheVersion: entry.cacheVersion,
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
        const request = indexedDB.open('next-offline-navigation-cache', 1)
        request.onupgradeneeded = () => {
          const database = request.result
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
          const transaction = database.transaction('segment-data', 'readonly')
          const request = transaction.objectStore('segment-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })

        return entries.map((entry) => ({
          buildId: entry.buildId,
          cacheVersion: entry.cacheVersion,
          key: entry.key,
          kind: entry.kind,
          payload: {
            bodyLength: entry.payload?.body?.byteLength,
            kind: entry.payload?.kind,
            requestKind: entry.payload?.requestKind,
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
        const request = indexedDB.open('next-offline-navigation-cache', 1)
        request.onupgradeneeded = () => {
          const database = request.result
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

  function getPersistedSegmentRequestKey(record: {
    segmentVaryPath?: Array<{
      value?: { kind?: string; value?: unknown }
    }>
  }): string | null {
    const requestKey = record.segmentVaryPath?.[0]?.value
    return requestKey?.kind === 'value' && typeof requestKey.value === 'string'
      ? requestKey.value
      : null
  }

  function isPersistedHeadSegmentRecord(record: {
    segmentVaryPath?: Array<{
      value?: { kind?: string; value?: unknown }
    }>
  }): boolean {
    return getPersistedSegmentRequestKey(record)?.endsWith('/_head') ?? false
  }

  async function deletePersistedOfflineNavigationSegmentRecords(
    browser: Awaited<ReturnType<typeof next.browser>>,
    options: {
      keySubstring: string
      requestKeySuffix: string
    }
  ) {
    return browser.eval(async ({ keySubstring, requestKeySuffix }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('next-offline-navigation-cache', 1)
        request.onupgradeneeded = () => {
          const database = request.result
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
          const transaction = database.transaction('segment-data', 'readonly')
          const request = transaction.objectStore('segment-data').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const matchingEntries = entries.filter((entry) => {
          const requestKey = entry.segmentVaryPath?.[0]?.value
          const requestKeyValue =
            requestKey?.kind === 'value' && typeof requestKey.value === 'string'
              ? requestKey.value
              : ''
          return (
            entry.key.includes(keySubstring) &&
            requestKeyValue.endsWith(requestKeySuffix)
          )
        })

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
    }, options)
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

  async function expectOfflineNavigationCacheMiss(
    browser: Awaited<ReturnType<typeof next.browser>>,
    reason: string
  ) {
    await retry(async () => {
      expect(
        await browser.eval(() => {
          const cacheMiss = document.getElementById(
            '__NEXT_OFFLINE_NAVIGATION_CACHE_MISS'
          )
          return {
            cache: document.documentElement.getAttribute(
              'data-next-offline-navigation-cache'
            ),
            reason: document.documentElement.getAttribute(
              'data-next-offline-navigation-cache-reason'
            ),
            miss: cacheMiss
              ? {
                  hidden: cacheMiss.hidden,
                  reason: cacheMiss.getAttribute(
                    'data-next-offline-navigation-cache-reason'
                  ),
                  text: cacheMiss.textContent,
                }
              : null,
          }
        })
      ).toEqual({
        cache: 'miss',
        reason,
        miss: {
          hidden: false,
          reason,
          text: 'This page is not available offline.',
        },
      })
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
    expect(html).toContain('id="__NEXT_OFFLINE_NAVIGATION_CACHE_MISS"')
    expect(html).toContain(`"buildId":"${buildId}"`)
    expect(html).not.toContain('"source"')
    if (next.deploymentId) {
      expect(html).toContain(`data-dpl-id="${next.deploymentId}"`)
    }
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
    expect(serviceWorkerScript).toContain(OFFLINE_NAVIGATION_FALLBACK_SERVED)
    expect(serviceWorkerScript).toContain('isDocumentNavigationRequest')
    expect(serviceWorkerScript).toContain('skipWaiting')
    expect(serviceWorkerScript).toContain('clients.claim')
    expect(serviceWorkerScript).not.toContain('\n')
    expect(serviceWorkerScript).toContain('respondWith')
    expect(serviceWorkerScript.length).toBeLessThan(8000)
  })

  it('registers the service worker and caches offline resources when enabled', async () => {
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
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        const prefetchedRouteRecord = routeRecords.find((record) =>
          record.route.pathname.includes('/prefetched')
        )
        expect(prefetchedRouteRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheVersion: 0,
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
        const headRecord = segmentRecords.find((record) =>
          isPersistedHeadSegmentRecord(record)
        )
        const pageRecord = segmentRecords.find(
          (record) =>
            !isPersistedHeadSegmentRecord(record) &&
            record.payload.requestKind === 'segment-prefetch'
        )

        expect(headRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheVersion: 0,
            kind: 'segment',
            payload: {
              bodyLength: expect.any(Number),
              kind: 'rsc-response',
              requestKind: 'segment-prefetch',
            },
            segment: expect.objectContaining({
              fetchStrategy: expect.any(Number),
              isPartial: expect.any(Boolean),
              payloadIndex: expect.any(Number),
            }),
            segmentVaryPath: expect.any(Array),
            version: 1,
          })
        )
        expect(headRecord!.payload.bodyLength).toBeGreaterThan(0)

        expect(pageRecord).toEqual(
          expect.objectContaining({
            buildId: navigationBuildId,
            cacheVersion: 0,
            kind: 'segment',
            payload: {
              bodyLength: expect.any(Number),
              kind: 'rsc-response',
              requestKind: 'segment-prefetch',
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
      const cachedServiceWorkerMessage = await browser.eval(() => {
        const message = localStorage.getItem('__nextOfflineNavigationMessage')
        return message === null ? null : JSON.parse(message)
      })
      expect(cachedServiceWorkerMessage).toEqual({
        type: OFFLINE_NAVIGATION_FALLBACK_SERVED,
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

      await next.stop()
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
      const serviceWorkerMessage = await browser.eval(() => {
        const message = localStorage.getItem('__nextOfflineNavigationMessage')
        return message === null ? null : JSON.parse(message)
      })
      expect(serviceWorkerMessage).toMatchObject({
        type: OFFLINE_NAVIGATION_FALLBACK_SERVED,
      })
      await expectOfflineNavigationCacheMiss(browser, 'missing-route')
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

  it('reconstructs a fully prefetched route from persisted Segment Cache records', async () => {
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
          segmentRecords.some((record) => isPersistedHeadSegmentRecord(record))
        ).toBe(true)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const segmentCacheOnlyResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(segmentCacheOnlyResponse?.status()).toBe(200)
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

  it('reconstructs a viewport-prefetched route from persisted Segment Cache records', async () => {
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
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes('/viewport-prefetch')
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some(
            (record) =>
              record.key.includes('viewport-prefetch') &&
              record.payload.requestKind === 'segment-prefetch'
          )
        ).toBe(true)
      })

      await retry(async () => {
        const cacheState = await readOfflineNavigationCacheState(browser)
        expect(cacheState.entries).toEqual(
          expect.arrayContaining([
            {
              cacheName: expect.stringMatching(/^next-offline-navigation-v1:/),
              pathname: expect.stringMatching(
                /^\/app-assets\/_next\/static\/(?:immutable\/)?chunks\/.+\.js$/
              ),
            },
          ])
        )
      })

      const session = await (
        page!.context() as Playwright.BrowserContext & {
          newCDPSession: (page: Playwright.Page) => Promise<{
            send: (method: string) => Promise<void>
            detach: () => Promise<void>
          }>
        }
      ).newCDPSession(page!)

      try {
        await session.send('Network.clearBrowserCache')
      } finally {
        await session.detach()
      }

      await next.stop()
      await page!.context().setOffline(true)
      const viewportPrefetchResponse = await page!.goto(
        `${next.url}/docs/viewport-prefetch`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(viewportPrefetchResponse?.status()).toBe(200)
      await retry(async () => {
        expect(await browser.elementById('viewport-prefetch-page').text()).toBe(
          'viewport prefetch page'
        )
      })
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted Segment Cache records when a required head record is missing during fallback boot', async () => {
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
              getPersistedSegmentRequestKey(record)?.endsWith('/__PAGE__') ===
                true
          )
        ).toBe(true)
        expect(
          segmentRecords.some((record) => isPersistedHeadSegmentRecord(record))
        ).toBe(true)
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
              getPersistedSegmentRequestKey(record)?.endsWith('/__PAGE__') ===
                true
          )
        ).toBe(true)
        expect(
          segmentRecords.some((record) => isPersistedHeadSegmentRecord(record))
        ).toBe(false)
      })

      await next.stop()
      await page!.context().setOffline(true)
      const missingHeadResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(missingHeadResponse?.status()).toBe(200)

      await expectOfflineNavigationCacheMiss(browser, 'missing-head')
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

  it('misses persisted Segment Cache records after router refresh invalidation', async () => {
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
          segmentRecords.some((record) => isPersistedHeadSegmentRecord(record))
        ).toBe(true)
      })

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
            'segment-cache-version'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await expectOfflineNavigationCacheMiss(browser, 'missing-segment')
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses persisted Segment Cache records after server action invalidation', async () => {
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
          segmentRecords.some((record) => isPersistedHeadSegmentRecord(record))
        ).toBe(true)
      })

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
            'route-cache-version'
          )
        ).toBeGreaterThan(0)
        expect(
          await readPersistedOfflineNavigationMetadata(
            browser,
            'segment-cache-version'
          )
        ).toBeGreaterThan(0)
      })

      await page!.context().setOffline(true)
      const invalidatedRouterRecordsResponse = await page!.goto(
        `${next.url}/docs/prefetched`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(invalidatedRouterRecordsResponse?.status()).toBe(200)
      await expectOfflineNavigationCacheMiss(browser, 'missing-route')
    } finally {
      if (page) {
        await page.context().setOffline(false)
      }
      await next.stop()
    }
  })

  it('misses hard-loaded request-sensitive URLs without cached Segment Cache records', async () => {
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
        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) =>
            record.key.includes('request-sensitive')
          )
        ).toBe(false)
      })

      await page!.context().setOffline(true)
      const offlineResponse = await page!.goto(
        `${next.url}/docs/request-sensitive/`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(offlineResponse?.status()).toBe(200)
      await expectOfflineNavigationCacheMiss(browser, 'missing-segment')

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

  it('misses hard-loaded URL shape stress cases without complete Segment Cache records', async () => {
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
        const routeRecords =
          await readPersistedOfflineNavigationRouteRecords(browser)
        expect(
          routeRecords.some((record) =>
            record.route.pathname.includes('/url-stress')
          )
        ).toBe(true)

        const segmentRecords =
          await readPersistedOfflineNavigationSegmentRecords(browser)
        expect(
          segmentRecords.some((record) => record.key.includes('url-stress'))
        ).toBe(false)
      })

      const rootResponse = await page!.goto(`${next.url}/docs/`, {
        waitUntil: 'domcontentloaded',
      })
      expect(rootResponse?.status()).toBe(200)

      await next.stop()
      await page!.context().setOffline(true)
      const offlineResponse = await page!.goto(cachedUrl, {
        waitUntil: 'domcontentloaded',
      })
      expect(offlineResponse?.status()).toBe(200)
      await expectOfflineNavigationCacheMiss(browser, 'missing-segment')

      const reorderedSearchResponse = await page!.goto(
        `${next.url}/docs/url-stress/space%20value/?tag=one&tag=two&token=a%2Bb#section-3`,
        { waitUntil: 'domcontentloaded' }
      )
      expect(reorderedSearchResponse?.status()).toBe(200)
      await expectOfflineNavigationCacheMiss(browser, 'missing-segment')

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

    expect(
      getStaticClientChunkForbiddenMatches(
        join(next.testDir, '.next', 'static', 'chunks'),
        [
          'next-offline-navigation-cache',
          'offline-navigation-cache',
          'data-next-offline-navigation',
          '_offline-navigation',
        ]
      )
    ).toEqual([])
  })
})
