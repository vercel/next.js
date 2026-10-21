import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import { randomUUID } from 'crypto'
import escapeStringRegexp from 'escape-string-regexp'
import stripAnsi from 'strip-ansi'
import { createTestDataServer } from 'test-data-service/writer'
import { createRouterAct } from 'router-act'
import type * as Playwright from 'playwright'

function defer(callback: () => Promise<void>) {
  return {
    [Symbol.asyncDispose]: callback,
  }
}

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// It likely asserts local CLI or runtime output that deploy tests do not expose.
// @force-gate !deploy
describe('use-cache-swr', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
  })

  // Each data-service request produces a new value. Holding the tested key
  // pauses background revalidation. Holding foregroundCacheKey pauses a
  // separate cold fill so the final prerender cannot start yet.
  const dataRequestCountsByKey = new Map<string, number>()
  const heldResponseKeys = new Set<string>()
  const pendingResponseResolversByKey = new Map<string, Array<() => void>>()
  let dataServer: ReturnType<typeof createTestDataServer>

  function releaseDataResponses(key: string) {
    heldResponseKeys.delete(key)
    pendingResponseResolversByKey.get(key)?.forEach((resolveResponse) => {
      resolveResponse()
    })
    pendingResponseResolversByKey.delete(key)
  }

  beforeAll(async () => {
    dataServer = createTestDataServer((key, response) => {
      const requestCount = (dataRequestCountsByKey.get(key) ?? 0) + 1
      dataRequestCountsByKey.set(key, requestCount)
      const resolveResponse = () => response.resolve(`${key}-v${requestCount}`)
      if (heldResponseKeys.has(key)) {
        const responseResolvers = pendingResponseResolversByKey.get(key) ?? []
        responseResolvers.push(resolveResponse)
        pendingResponseResolversByKey.set(key, responseResolvers)
      } else {
        resolveResponse()
      }
    })
    const port = await findPort()
    dataServer.listen(port)
    next.env.TEST_DATA_SERVICE_URL = `http://localhost:${port}`
    await next.start()
    if (isNextDev) {
      // Compile both pages before `warmData()` creates the entries under test.
      // Neither request has an `id`, so both pages skip their cached functions.
      await next.render('/caller-context')
      await next.render('/caller-context/foreground-first')
    }
  })

  afterAll(() => dataServer?.close())

  async function warmData(id: string) {
    const initial: { value: string; createdAt: number } = await next
      .fetch(`/caller-context/warm?id=${id}`)
      .then((response) => response.json())
    await retry(
      () => {
        expect(Date.now() - initial.createdAt).toBeGreaterThan(1100)
      },
      5000,
      100
    )
    outputIndex = next.cliOutput.length
    return initial
  }

  function expectOneWrite(id: string) {
    expect(getOutput()).toIncludeRepeated(
      `PersistentCacheHandler::set [^\\r\\n]*${escapeStringRegexp(JSON.stringify([id]))}`,
      1
    )
  }

  let outputIndex: number

  beforeEach(() => {
    outputIndex = next.cliOutput.length
  })

  function getOutput() {
    return stripAnsi(next.cliOutput.slice(outputIndex))
      .split('\n')
      .filter((line) => !line.includes(' Cache '))
      .join('\n')
  }

  async function fetchRdcDocument(key: string, foregroundCacheKey: string) {
    const response = await next.fetch('/rdc', {
      headers: {
        cookie: `key=${key}; foregroundCacheKey=${foregroundCacheKey}`,
      },
    })
    expect(response.status).toBe(200)
    return response.text()
  }

  function expectConsistentCacheValue(
    response: string,
    key: string,
    version: number
  ) {
    const values =
      response.match(new RegExp(`${escapeStringRegexp(key)}-v\\d+`, 'g')) ?? []
    expect([...new Set(values)]).toEqual([`${key}-v${version}`])
  }

  async function prepareStaleCacheEntry(key: string) {
    // The warmup request uses a separate foreground key so the next request
    // starts a new cache fill that the test can hold.
    expectConsistentCacheValue(
      await fetchRdcDocument(key, `${key}:warmup`),
      key,
      1
    )
    const warmedAt = Date.now()
    await retry(() => {
      expect(Date.now() - warmedAt).toBeGreaterThan(1100)
    })
    outputIndex = next.cliOutput.length
  }

  async function waitForRevalidationAndForegroundRead(
    key: string,
    foregroundCacheKey: string
  ) {
    await retry(() => {
      expect(dataRequestCountsByKey.get(key)).toBe(2)
      expect(dataRequestCountsByKey.get(foregroundCacheKey)).toBe(1)
    })
  }

  async function waitForCacheHandlerWrite(key: string) {
    const keyPattern = escapeStringRegexp(JSON.stringify(key))
    await retry(() => {
      expect(getOutput()).toMatch(
        new RegExp(`PersistentCacheHandler::set[^\\r\\n]*${keyPattern}`)
      )
    })
  }

  async function expectRevalidatedCacheEntry(key: string) {
    await waitForCacheHandlerWrite(key)
    expectConsistentCacheValue(
      await fetchRdcDocument(key, `${key}:warmup`),
      key,
      2
    )
  }

  async function createRdcBrowser(
    key: string,
    foregroundCacheKey: string,
    pathname = '/rdc/links'
  ) {
    let page: Playwright.Page
    const { browser, response } = await next.browserWithResponse(pathname, {
      async beforePageLoad(browserPage: Playwright.Page) {
        page = browserPage
        await page.context().addCookies([
          { name: 'key', value: key, url: next.url },
          {
            name: 'foregroundCacheKey',
            value: foregroundCacheKey,
            url: next.url,
          },
        ])
      },
    })
    const act = createRouterAct(page, { includeAppShellRequests: true })
    return { browser, act, response }
  }

  async function expectCachedRdcNavigation(
    browser: Awaited<ReturnType<typeof next.browser>>,
    act: ReturnType<typeof createRouterAct>,
    key: string
  ) {
    // The embedded runtime prerender must cache the page for a return
    // navigation without a server request.
    await act(
      async () => {
        await browser
          .elementByCss('input[data-link-accordion="/rdc/return"]')
          .click()
        await browser.elementByCss('a[href="/rdc/return"]').click()
      },
      { includes: 'Return to cached page' }
    )
    await act(async () => {
      await browser.elementByCss('input[data-link-accordion="/rdc"]').click()
      await browser.elementByCss('a[href="/rdc"]').click()
    }, 'no-requests')
    expect(await browser.elementById('rdc-value').text()).toBe(`${key}-v1`)
  }

  // @force-gate prefetching
  it('serves the same stale value in HTML, hydration data, and the embedded runtime prefetch while revalidation is pending', async () => {
    const key = `rdc-document-${randomUUID()}`
    const foregroundCacheKey = `${key}:foreground`
    await prepareStaleCacheEntry(key)
    heldResponseKeys.add(key)
    heldResponseKeys.add(foregroundCacheKey)
    const pendingDocument = createRdcBrowser(key, foregroundCacheKey, '/rdc')
    try {
      await waitForRevalidationAndForegroundRead(key, foregroundCacheKey)
      // Finish the foreground fill while revalidation stays pending. The
      // document and its embedded runtime prerender must both use the stale
      // entry.
      releaseDataResponses(foregroundCacheKey)
      const { browser, response, act } = await pendingDocument
      await using _ = defer(() => browser.deleteCookies())
      expect(await browser.elementById('rdc-value').text()).toBe(`${key}-v1`)
      expectConsistentCacheValue(await response.text(), key, 1)
      await expectCachedRdcNavigation(browser, act, key)
    } finally {
      releaseDataResponses(foregroundCacheKey)
      releaseDataResponses(key)
      await pendingDocument
    }
    await expectRevalidatedCacheEntry(key)
  })

  // @force-gate prefetching
  it('serves the same stale value in navigation data and the embedded runtime prefetch while revalidation is pending', async () => {
    const key = `rdc-navigation-${randomUUID()}`
    const foregroundCacheKey = `${key}:foreground`
    await prepareStaleCacheEntry(key)
    const { browser, act } = await createRdcBrowser(key, foregroundCacheKey)
    await using _ = defer(() => browser.deleteCookies())
    heldResponseKeys.add(key)
    heldResponseKeys.add(foregroundCacheKey)
    const pendingNavigation = act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/rdc"][data-prefetch="false"]'
          )
          .click()
        await browser.elementByCss('a[href="/rdc"]').click()
      },
      { includes: `${key}-v1` }
    )
    try {
      await waitForRevalidationAndForegroundRead(key, foregroundCacheKey)
      // The navigation and its embedded runtime prerender must finish before
      // background revalidation completes.
      releaseDataResponses(foregroundCacheKey)
      await pendingNavigation
      expect(await browser.elementById('rdc-value').text()).toBe(`${key}-v1`)
      await expectCachedRdcNavigation(browser, act, key)
    } finally {
      releaseDataResponses(foregroundCacheKey)
      releaseDataResponses(key)
      await pendingNavigation
    }
    await expectRevalidatedCacheEntry(key)
  })

  // @force-gate prefetching
  it("reuses the prospective prerender's stale value in the final runtime prerender after background revalidation completes", async () => {
    const key = `rdc-prefetch-${randomUUID()}`
    const foregroundCacheKey = `${key}:foreground`
    await prepareStaleCacheEntry(key)
    const { browser, act } = await createRdcBrowser(key, foregroundCacheKey)
    await using _ = defer(() => browser.deleteCookies())
    heldResponseKeys.add(key)
    heldResponseKeys.add(foregroundCacheKey)
    const pendingPrefetch = act(
      async () => {
        await browser
          .elementByCss(
            'input[data-link-accordion="/rdc"][data-prefetch="true"]'
          )
          .click()
      },
      { includes: `${key}-v1`, kind: 'runtime' }
    )
    try {
      await waitForRevalidationAndForegroundRead(key, foregroundCacheKey)
      // Complete revalidation while the foreground fill still holds the
      // prospective prerender open. The final prerender must reuse the stale
      // RDC entry despite the new handler value.
      releaseDataResponses(key)
      await waitForCacheHandlerWrite(key)
      releaseDataResponses(foregroundCacheKey)
      await pendingPrefetch
      await act(async () => {
        await browser.elementByCss('a[href="/rdc"]').click()
      }, 'no-requests')
      expect(await browser.elementById('rdc-value').text()).toBe(`${key}-v1`)
    } finally {
      releaseDataResponses(foregroundCacheKey)
      releaseDataResponses(key)
      await pendingPrefetch
    }
    await expectRevalidatedCacheEntry(key)
  })

  // @force-gate dev
  it('completes dev validation with stale cached data without reporting uncached data while revalidation is pending', async () => {
    const key = 'rdc-validation'
    await next.render('/rdc/first')
    const warmedAt = Date.now()
    await retry(() => {
      expect(Date.now() - warmedAt).toBeGreaterThan(1100)
    })

    outputIndex = next.cliOutput.length
    heldResponseKeys.add(key)
    heldResponseKeys.add('rdc-second')
    const rendering = next.render$('/rdc/second')
    try {
      await retry(() => {
        expect(dataRequestCountsByKey.get(key)).toBe(2)
        expect(dataRequestCountsByKey.get('rdc-second')).toBe(1)
      }, 10_000)
      // Finish the cold fill to allow validation to start. Revalidation remains
      // held, so validation must reuse the stale RDC entry.
      releaseDataResponses('rdc-second')
      const $ = await rendering
      expect($('#rdc-value').text()).toBe(`${key}-v1`)

      // The uncached page logs after both reads in each render. Its second log
      // confirms validation consumed the entry before regeneration was
      // released.
      await retry(() => {
        expect(
          getOutput().match(/RDC validation second: rdc-validation-v1/g)
            ?.length ?? 0
        ).toBeGreaterThanOrEqual(2)
      })
      expect(getOutput()).not.toContain('encountered uncached data')
    } finally {
      releaseDataResponses('rdc-second')
      releaseDataResponses(key)
      await rendering
    }
  })

  it('reuses a completed background revalidation when outer caches need fresh data from the same stale lookup', async () => {
    const id = `caller-context-${randomUUID()}`
    const initial = await warmData(id)
    // Pause the page after its direct `readData()` call returns stale data. The
    // nested `readOuter()` calls start after the `outer:<id>` response
    // completes.
    heldResponseKeys.add(`outer:${id}`)
    const rendering = next.render$(`/caller-context?id=${id}`)
    try {
      await retry(() => {
        expect(dataRequestCountsByKey.get(`outer:${id}`)).toBeGreaterThan(0)
        expectOneWrite(id)
      })
      // The nested calls must use the revalidated entry after its handler write
      // completes. Neither call should execute the cached function again.
      releaseDataResponses(`outer:${id}`)
      const $ = await rendering
      expect($('#direct').text()).toBe(initial.value)
      expect($('#first').text()).not.toBe(initial.value)
      expect($('#first').text()).not.toBe('')
      expect($('#second').text()).toBe($('#first').text())
      expect(dataRequestCountsByKey.get(`fill:${id}`)).toBe(2)
      expectOneWrite(id)
    } finally {
      releaseDataResponses(`outer:${id}`)
      await rendering
    }
  })

  it('serves stale data to a direct caller while an outer cache waits for the shared foreground fill', async () => {
    const id = `caller-context-${randomUUID()}`
    const initial = await warmData(id)
    // Pause the nested `readData()` call at `fill:<id>`, then start the direct
    // call. The nested call requires fresh data. The direct call can use the
    // stale entry.
    heldResponseKeys.add(`fill:${id}`)
    heldResponseKeys.add(`direct-ready:${id}`)
    const rendering = next.render$(`/caller-context/foreground-first?id=${id}`)
    try {
      await retry(() => {
        expect(dataRequestCountsByKey.get(`fill:${id}`)).toBe(2)
        expect(
          dataRequestCountsByKey.get(`direct-ready:${id}`)
        ).toBeGreaterThan(0)
      })
      releaseDataResponses(`direct-ready:${id}`)
      // The `direct-served:<id>` request confirms that the direct call resolved
      // while the nested call's generation remains pending.
      await retry(
        () => {
          expect(
            dataRequestCountsByKey.get(`direct-served:${id}`)
          ).toBeGreaterThan(0)
        },
        5000,
        100
      )
      releaseDataResponses(`fill:${id}`)
      const $ = await rendering
      expect($('#direct').text()).toBe(initial.value)
      expect($('#outer').text()).not.toBe(initial.value)
      expect($('#outer').text()).not.toBe('')
      expect(dataRequestCountsByKey.get(`fill:${id}`)).toBe(2)
      expectOneWrite(id)
    } finally {
      releaseDataResponses(`direct-ready:${id}`)
      releaseDataResponses(`fill:${id}`)
      await rendering
    }
  })

  it('should serve stale data and then refreshed data on a subsequent request', async () => {
    const browser = await next.browser('/')
    const initialOuter = await browser.elementById('outer-data').text()
    expect(initialOuter).toBeDateString()

    // Wait for the outer cache to go stale (revalidate: 5).
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Reset output index so the regen set we poll for below can't be satisfied
    // by the initial cold-fill set from the first fetch.
    outputIndex = next.cliOutput.length

    // This request should trigger SWR: the handler returns the stale entry,
    // the framework serves it to the client, and kicks off a background regen.
    await browser.refresh()
    const afterStale = await browser.elementById('outer-data').text()

    // The stale data should be the same as the initial data.
    expect(afterStale).toBe(initialOuter)

    // Wait for the background regen to complete by polling for its set log.
    await retry(() => {
      const regenOutput = next.cliOutput.slice(outputIndex)
      expect(regenOutput).toMatch(/PersistentCacheHandler::set.*"outer"/)
    })

    // Reset output index to capture only the next request's handler logs.
    outputIndex = next.cliOutput.length

    // Refresh again. The pre-warmed entry from the SWR regen should be served.
    await browser.refresh()
    const afterRegen = await browser.elementById('outer-data').text()

    // The data should now be fresh (different from the stale data).
    expect(afterRegen).not.toBe(initialOuter)

    // Verify this was served from the pre-warmed cache (get hit, no regen set).
    // In production the backing `get` hit is logged synchronously during the
    // request. In dev the warm read is served from the built-in front handler
    // in a microtask and the backing `get` runs in the background reconcile, so
    // we poll for it. Either way, no regeneration `set` should occur.
    await retry(() => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toMatch(/PersistentCacheHandler::get.*"outer".*-> hit/)
      expect(cliOutput).not.toMatch(/PersistentCacheHandler::set.*"outer"/)
    })
  })

  it('should serve stale data without blocking on the background regeneration', async () => {
    // Fetch 1: cold cache. The cached component blocks for ~1s.
    const $1 = await next.render$('/delayed')
    const cached1 = $1('#cached').text()
    const dynamic1 = $1('#dynamic').text()
    expect(cached1).toBeDateString()
    expect(dynamic1).toBeDateString()

    // Wait past the 1s revalidate window (cacheLife('seconds')).
    await new Promise((resolve) => setTimeout(resolve, 1200))

    outputIndex = next.cliOutput.length

    // Fetch 2: stale hit. Should return the stale entry immediately and kick
    // off the regeneration in the background, rather than blocking on the 1s
    // delay in the cached component.
    const start2 = Date.now()
    const $2 = await next.render$('/delayed')
    const duration2 = Date.now() - start2
    const cached2 = $2('#cached').text()
    const dynamic2 = $2('#dynamic').text()

    expect(cached2).toBe(cached1)
    expect(dynamic2).not.toBe(dynamic1)
    expect(duration2).toBeLessThan(1000)

    // Wait for the background regen to finish writing the fresh entry.
    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toMatch(
        /PersistentCacheHandler::set/
      )
    })

    // Fetch 3: should serve the pre-warmed fresh entry from the background
    // regen, not a new stale value.
    const start3 = Date.now()
    const $3 = await next.render$('/delayed')
    const duration3 = Date.now() - start3
    const cached3 = $3('#cached').text()
    const dynamic3 = $3('#dynamic').text()

    expect(cached3).not.toBe(cached1)
    expect(dynamic3).not.toBe(dynamic2)
    expect(duration3).toBeLessThan(1000)
  })

  it('should serve stale data without blocking on the background regeneration (route handler)', async () => {
    // Fetch 1: cold cache. The cached function blocks for ~1s.
    const res1 = await next.fetch('/delayed-route')
    const { cached: cached1, dynamic: dynamic1 } = await res1.json()
    expect(cached1).toBeDateString()
    expect(dynamic1).toBeDateString()

    // Wait past the 1s revalidate window (cacheLife('seconds')).
    await new Promise((resolve) => setTimeout(resolve, 1200))

    outputIndex = next.cliOutput.length

    // Fetch 2: stale hit. Should return the stale entry immediately and kick
    // off the regeneration in the background, rather than blocking on the 1s
    // delay in the cached function.
    const start2 = Date.now()
    const res2 = await next.fetch('/delayed-route')
    const { cached: cached2, dynamic: dynamic2 } = await res2.json()
    const duration2 = Date.now() - start2

    expect(cached2).toBe(cached1)
    expect(dynamic2).not.toBe(dynamic1)
    expect(duration2).toBeLessThan(1000)

    // Wait for the background regen to finish writing the fresh entry.
    await retry(() => {
      expect(next.cliOutput.slice(outputIndex)).toMatch(
        /PersistentCacheHandler::set/
      )
    })

    // Fetch 3: should serve the pre-warmed fresh entry from the background
    // regen, not a new stale value.
    const start3 = Date.now()
    const res3 = await next.fetch('/delayed-route')
    const { cached: cached3, dynamic: dynamic3 } = await res3.json()
    const duration3 = Date.now() - start3

    expect(cached3).not.toBe(cached1)
    expect(dynamic3).not.toBe(dynamic2)
    expect(duration3).toBeLessThan(1000)
  })

  it('should pass implicit tags to cache handler get() for nested caches during SWR', async () => {
    const browser = await next.browser('/')
    await browser.elementById('outer-data').text()

    // Wait for the outer cache to go stale (revalidate: 5).
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Reset output index to capture only the SWR-related logs.
    outputIndex = next.cliOutput.length

    // This triggers SWR: stale outer is served, background regen starts.
    // During regen, the outer fn re-executes and calls the inner "use cache".
    // The inner cache's get() should receive the page's implicit tags.
    await browser.refresh()

    // Wait for the background regen to complete.
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const cliOutput = next.cliOutput.slice(outputIndex)

    // The inner cache's get() during SWR regen should include the page's
    // implicit tags (softTags), not an empty array. We identify the inner
    // cache by its "inner" sentinel argument in the key.
    expect(cliOutput).toMatch(/PersistentCacheHandler::get.*"inner".*_N_T_\//)
  })

  it.each([
    { mode: 'concurrent', scenario: 'across concurrent requests' },
    {
      mode: 'slow-read',
      scenario:
        'when a cache handler read returns stale data after revalidation completes',
    },
  ])('deduplicates background revalidations $scenario', async ({ mode }) => {
    const id = `${mode}-${randomUUID()}`
    const pathname = `/delayed-route?id=${id}`
    const initial = await (await next.fetch(pathname)).json()
    expect(initial.cached).toBeDateString()
    outputIndex = next.cliOutput.length

    // The simulated I/O takes as long as this entry's revalidate interval.
    // Complete one stale read before starting another to avoid sharing only the
    // lookup.
    expect((await (await next.fetch(pathname)).json()).cached).toBe(
      initial.cached
    )
    expect((await (await next.fetch(pathname)).json()).cached).toBe(
      initial.cached
    )

    await retry(() => {
      const output = getOutput()
      expect(output).toIncludeRepeated(
        escapeStringRegexp(`use-cache-swr: generating delayed data ${id}`),
        1
      )
      expect(output).toIncludeRepeated(
        escapeStringRegexp(`use-cache-swr: generated delayed data ${id}`),
        1
      )
    })

    const fresh = await (await next.fetch(pathname)).json()
    expect(fresh.cached).toBeDateString()
    expect(fresh.cached).not.toBe(initial.cached)
  })

  it('should not start another regeneration for a read during a background cache write', async () => {
    const id = `write-completion-${randomUUID()}`
    const pathname = `/delayed-route?id=${id}`
    const initial = await (await next.fetch(`${pathname}&request=warm`)).json()
    expect(initial.cached).toBeDateString()
    const writeFinished = `PersistentCacheHandler::set [^\\r\\n]*${escapeStringRegexp(id)}`
    await retry(() => {
      expect(getOutput()).toMatch(new RegExp(writeFinished))
    })
    outputIndex = next.cliOutput.length

    expect(
      (await (await next.fetch(`${pathname}&request=trigger`)).json()).cached
    ).toBe(initial.cached)
    await retry(() => {
      expect(getOutput()).toMatch(
        new RegExp(
          `PersistentCacheHandler::set-start [^\\r\\n]*${escapeStringRegexp(id)}`
        )
      )
    })
    const fresh = await (
      await next.fetch(`${pathname}&request=during-write`)
    ).json()
    expect(fresh.cached).toBeDateString()
    expect(fresh.cached).not.toBe(initial.cached)
    const completion = `pending revalidates promise finished for: ${pathname}&request=trigger`
    await retry(() => {
      const output = getOutput()
      expect(output).toIncludeRepeated(escapeStringRegexp(completion), 1)
      expect(output).toMatch(
        new RegExp(
          `${writeFinished}[^\\r\\n]*\\r?\\n[\\s\\S]*${escapeStringRegexp(completion)}`
        )
      )
    })
    expect(getOutput()).toMatch(
      new RegExp(
        `PersistentCacheHandler::get-pending [^\\r\\n]*${escapeStringRegexp(id)}`
      )
    )
    expect(getOutput()).toIncludeRepeated(
      escapeStringRegexp(`use-cache-swr: generating delayed data ${id}`),
      1
    )
  })
})
