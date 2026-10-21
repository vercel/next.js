import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { CacheWrite } from './cache-writes'
import { randomUUID } from 'crypto'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// Skip deployment so we can test the custom cache handlers log output
// @force-gate !deploy
describe('use-cache-custom-handler', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  let outputIndex: number

  beforeEach(() => {
    outputIndex = next.cliOutput.length
  })

  it('uses the custom handler for the first request during startup', async () => {
    const $ = await next.render$('/registration')
    expect($('#data').text()).toBe('registration')

    await retry(async () => {
      const writes: CacheWrite[] = await next
        .fetch('/cache-writes')
        .then((response) => response.json())
      expect(writes).toContainEqual(
        expect.objectContaining({
          tags: expect.arrayContaining(['registration']),
        })
      )
    }, 3000)
  })

  it('should use a modern custom cache handler if provided', async () => {
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    const cliOutput = next.cliOutput.slice(outputIndex)

    expect(cliOutput).toContain('ModernCustomCacheHandler::refreshTags')

    // The implementation parts contain either the code hash and version or the
    // build ID, followed by an optional HMR refresh hash in development.
    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /ModernCustomCacheHandler::get \["([0-9a-f]{2})+",\[\],\["(development|[A-Za-z0-9_-]+)"(,"[^"]+")*\]\] \[ '_N_T_\/layout', '_N_T_\/page', '_N_T_\/', '_N_T_\/index' \]/
    )

    // Since no existing cache entry was retrieved, we don't need to call
    // getExpiration() to compare the cache entries timestamp with the
    // expiration of the implicit tags.
    expect(cliOutput).not.toContain(`ModernCustomCacheHandler::getExpiration`)

    // The data should be cached initially.

    outputIndex = next.cliOutput.length
    await browser.refresh()
    let data = await browser.elementById('data').text()
    expect(data).toMatch(isoDateRegExp)
    expect(data).toEqual(initialData)

    // Now that a cache entry exists, we expect that getExpiration() is called
    // to compare the cache entries timestamp with the expiration of the
    // implicit tags.
    expect(next.cliOutput.slice(outputIndex)).toContain(
      `ModernCustomCacheHandler::getExpiration ["_N_T_/layout","_N_T_/page","_N_T_/","_N_T_/index"]`
    )

    // Because we use a low `revalidate` value for the "use cache" function, new
    // data should be returned eventually.

    await retry(
      async () => {
        await browser.refresh()
        data = await browser.elementById('data').text()
        expect(data).toMatch(isoDateRegExp)
        expect(data).not.toEqual(initialData)
      },
      10_000,
      2_000
    )
  })

  it('calls neither refreshTags nor getExpiration if "use cache" is not used', async () => {
    await next.fetch(`/no-cache`)
    const cliOutput = next.cliOutput.slice(outputIndex)

    expect(cliOutput).not.toContain('ModernCustomCacheHandler::refreshTags')
    expect(cliOutput).not.toContain(`ModernCustomCacheHandler::getExpiration`)
  })

  it('should revalidate after redirect using a modern custom cache handler', async () => {
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    await browser.elementById('revalidate-redirect').click()

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'ModernCustomCacheHandler::updateTags ["modern"]'
      )

      const data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should not call updateTags for a normal invocation', async () => {
    await next.fetch(`/`)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toInclude('ModernCustomCacheHandler::refreshTags')
      expect(cliOutput).not.toInclude('ModernCustomCacheHandler::updateTags')
    })
  })

  it('should not call getExpiration after an action', async () => {
    const browser = await next.browser(`/`)

    outputIndex = next.cliOutput.length

    await browser.elementById('revalidate-tag').click()

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).not.toInclude('ModernCustomCacheHandler::getExpiration')
      expect(cliOutput).toIncludeRepeated(
        `ModernCustomCacheHandler::updateTags`,
        1
      )
    })
  })

  it('should call updateTags once per profile group', async () => {
    const browser = await next.browser(`/`)

    outputIndex = next.cliOutput.length

    await browser.elementById('revalidate-multiple-profiles').click()

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toInclude(
        'ModernCustomCacheHandler::updateTags ["modern"]'
      )
      expect(cliOutput).toInclude(
        'ModernCustomCacheHandler::updateTags ["other"]'
      )
    })
  })

  if (isNextStart) {
    it('should save a short-lived cache during prerendering at buildtime', async () => {
      expect(next.cliOutput).toMatch(
        /ModernCustomCacheHandler::set \["([0-9a-f]{2})+",\[{"id":"dynamic-cache"}\],\["[A-Za-z0-9_-]+"(,"[^"]+")*\]\]/
      )
    })
  }

  it('should dedupe nested caches across different outer cache scopes, and still propagate cache life/tags correctly', async () => {
    const $ = await next.render$('/nested')
    const values = $('p#inner')
      .map((_, element) => $(element).text())
      .get()
    expect(values).toHaveLength(2)
    expect(values[0]).toBeTruthy()
    expect(values[0]).toBe(values[1])

    await retry(async () => {
      const writes: CacheWrite[] = await next
        .fetch('/cache-writes')
        .then((response) => response.json())
      const nestedWrites = writes.filter(({ tags }) =>
        tags.some((tag) => ['inner', 'outer1', 'outer2'].includes(tag))
      )
      expect(new Set(nestedWrites.map(({ cacheKey }) => cacheKey)).size).toBe(3)
      expect(nestedWrites).toEqual([
        expect.objectContaining({
          revalidate: 180,
          expire: 300,
          tags: ['inner'],
        }),
        expect.objectContaining({
          revalidate: 180,
          expire: 300,
          tags: ['outer1', 'inner'],
        }),
        expect.objectContaining({
          revalidate: 180,
          expire: 300,
          tags: ['outer2', 'inner'],
        }),
      ])
    })
  })

  it('should reach the cache handler only once for sequential calls in a request', async () => {
    const $ = await next.render$('/sequential-dedupe')

    expect($('#first').text()).toBe($('#second').text())

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)

      // The second call reuses the entry generated by the first call. Only one
      // handler `get()` is needed, even though the calls are sequential.
      expect(cliOutput).toIncludeRepeated(`ModernCustomCacheHandler::get`, 1)

      // Matched up to the escaped opening bracket of the logged cache key,
      // since `::set-resolved-entry` would otherwise count as another `::set`.
      // The matcher compiles its argument as a regular expression.
      expect(cliOutput).toIncludeRepeated(
        `ModernCustomCacheHandler::set \\[`,
        1
      )
    })
  })

  // Development serves front-cache hits before reconciling the backing cache.
  // Its serialized backing reads cannot reach both held lookups concurrently.
  // @force-gate start
  it('regenerates data for a revalidated route while another route reads the same cache entry', async () => {
    const control = (action: string) =>
      next.fetch('/path-revalidation', { method: 'POST', body: action })
    const readLookupState = () =>
      next.fetch('/path-revalidation').then(
        (response) =>
          response.json() as Promise<{
            softTags: string[][]
            startedRoutes: string[]
          }>
      )
    const initial = (await next.render$('/path-revalidation/a'))('#data').text()

    await retry(async () => {
      const writes: CacheWrite[] = await next
        .fetch('/cache-writes')
        .then((response) => response.json())
      expect(writes).toContainEqual(
        expect.objectContaining({ tags: ['path-revalidation'] })
      )
    })

    // Revalidate only route B, so route A can still use the existing entry.
    // Pause A's `get()` until B calls the same cached function.
    expect((await control('revalidate-route-b')).status).toBe(204)
    expect((await control('hold-entry-lookup')).status).toBe(204)
    const routeARendering = next.render$('/path-revalidation/a')
    let routeBRendering: ReturnType<typeof next.render$> | undefined

    try {
      await retry(async () => {
        expect((await readLookupState()).softTags).toEqual([
          expect.arrayContaining(['_N_T_/path-revalidation/a/page']),
        ])
      })
      routeBRendering = next.render$('/path-revalidation/b')
      await retry(async () => {
        expect((await readLookupState()).startedRoutes).toEqual(['a', 'b'])
      })

      expect((await control('release-entry-lookup')).status).toBe(204)
      const [routeAPage, routeBPage] = await Promise.all([
        routeARendering,
        routeBRendering,
      ])
      // A must return the existing value. B must generate a new value because
      // its implicit tags were revalidated. Each `get()` must receive its own
      // route's implicit tags.
      expect(routeAPage('#data').text()).toBe(initial)
      expect(routeBPage('#data').text()).not.toBe(initial)
      expect(routeBPage('#data').text()).not.toBe('')
      expect((await readLookupState()).softTags).toEqual([
        expect.arrayContaining(['_N_T_/path-revalidation/a/page']),
        expect.arrayContaining(['_N_T_/path-revalidation/b/page']),
      ])
    } finally {
      await control('release-entry-lookup')
      await Promise.allSettled([routeARendering, routeBRendering])
    }
  })

  async function readAfterObservedFillCompletes(revalidateRouteB: boolean) {
    const id = `observed-miss-${randomUUID()}`
    const pathname = `/path-revalidation?id=${id}`
    const control = (action: string) =>
      next.fetch(pathname, { method: 'POST', body: action })
    const readState = () =>
      next.fetch(pathname).then(
        (response) =>
          response.json() as Promise<{
            fills: string[]
            writes: string[]
            routeBLookupKeys: string[]
          }>
      )
    const initial = (await next.render$(`/path-revalidation/a?id=${id}`))(
      '#data'
    ).text()
    await retry(async () => {
      expect((await readState()).writes).toHaveLength(1)
    })

    // Route B's lookup selects its result while A's replacement fill is
    // pending. The handler holds that result until A's write completes.
    await control('hold-fill')
    await control('invalidate-entry')
    const routeARendering = next.render$(`/path-revalidation/a?id=${id}`)
    let routeBRendering: ReturnType<typeof next.render$> | undefined
    try {
      await retry(async () => {
        expect((await readState()).fills).toHaveLength(2)
      })
      if (revalidateRouteB) {
        // A's entry predates B's invalidation, so the handler must reject it
        // for B.
        await control('revalidate-route-b')
      }
      await control('hold-route-lookup-result')
      routeBRendering = next.render$(`/path-revalidation/b?id=${id}`)
      await retry(async () => {
        expect((await readState()).routeBLookupKeys).toHaveLength(1)
      })

      await control('release-fill')
      const routeAPage = await routeARendering
      const refreshed = routeAPage('#data').text()
      expect(refreshed).not.toBe(initial)
      expect(refreshed).not.toBe('')
      await retry(async () => {
        expect((await readState()).writes).toHaveLength(2)
      })
      await control('release-route-lookup-result')
      const routeBPage = await routeBRendering
      const state = await retry(async () => {
        const state = await readState()
        expect(state.writes).toHaveLength(state.fills.length)
        return state
      })

      return {
        producerValue: refreshed,
        consumerValue: routeBPage('#data').text(),
        state,
      }
    } finally {
      await control('release-fill')
      await control('release-route-lookup-result')
      await Promise.allSettled([routeARendering, routeBRendering])
    }
  }

  // These tests control when the custom handler's `get()` returns. Development
  // can serve an entry from its in-memory handler before that call completes.
  // @force-gate start
  it('reuses a handler entry written while its initial lookup was pending', async () => {
    const { producerValue, consumerValue, state } =
      await readAfterObservedFillCompletes(false)

    expect(consumerValue).toBe(producerValue)
    expect(state.fills).toHaveLength(2)
    expect(state.writes).toHaveLength(2)
    expect(state.routeBLookupKeys).toHaveLength(2)
  })

  // @force-gate start
  it('respects a route-specific handler miss after an observed fill finishes during lookup', async () => {
    const { producerValue, consumerValue, state } =
      await readAfterObservedFillCompletes(true)

    expect(consumerValue).not.toBe(producerValue)
    expect(consumerValue).not.toBe('')
    expect(state.fills).toHaveLength(3)
    expect(state.writes).toHaveLength(3)
    expect(state.routeBLookupKeys).toHaveLength(2)
  })

  if (isNextStart) {
    it('handles a failed handler preload without an unhandled rejection', async () => {
      await next.stop()
      await next.start({
        skipBuild: true,
        env: { NEXT_TEST_FAIL_CUSTOM_CACHE_HANDLER: '1' },
      })

      await retry(() => {
        expect(next.cliOutput).toContain('Failed to preload entries:')
        expect(next.cliOutput).toContain(
          'test custom cache handler failed to load'
        )
      })

      const response = await next.fetch('/registration')
      expect(response.status).toBe(500)
      expect(next.cliOutput).not.toContain('unhandledRejection:')
    })
  }
})
