import { NextInstance, nextTestSetup } from 'e2e-utils'
import { assertNoConsoleErrors, retry, debugPrint } from 'next-test-utils'
import { computeCacheBustingSearchParam } from 'next/dist/shared/lib/router/utils/cache-busting-search-param'
import { inspect } from 'util'

// RDC and resume renders do not function in the same way in dev.
// This test suite asserts on production behavior.
// @force-gate !dev
describe('resume-data-cache', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  const logPaths = (name: string, path: string, next: NextInstance) => {
    debugPrint(`[${name}] path: ${path}`)
    if (isNextDeploy) {
      debugPrint(`links:`)
      debugPrint(`  html:    ${next.url}${path}`)
      debugPrint(`  rsc:     ${next.url}${path}.rsc`)
      const pageSegmentPath = `${path}.segments/${path}/__PAGE__.segment.rsc`
      debugPrint(`  segment: ${next.url}${pageSegmentPath}`)
    }
  }

  describe('should have consistent data between static and dynamic renders', () => {
    type TestCase = {
      name: string
      path: string
      valuePattern: RegExp
    }

    const testInitial = async ({ name, path, valuePattern }: TestCase) => {
      debugPrint('='.repeat(80))
      logPaths(name, path, next)

      const requestGetters = createRequestGetters(next, path)
      const colorMarks: ColorMarks = new Map()
      const { values, texts } = await fetchAllSources({
        requestGetters,
        valuePattern,
      })
      assignColorMarks(colorMarks, values)
      expectSameCacheValueInAllSources({
        values,
        texts,
        valuePattern,
        debugLabel: name,
        colorMarks,
      })
    }

    // In deploy mode, revalidation can take a while to propagate.
    const POST_REVALIDATION_RETRY = isNextDeploy ? 10_000 : 5_000

    const testRevalidationSingle = async ({
      name,
      path,
      cacheTag,
      valuePattern,
      source,
    }: TestCase & {
      cacheTag: string
      source: Source
    }) => {
      debugPrint('='.repeat(80))
      logPaths(name, path, next)

      const requestGetters = createRequestGetters(next, path)
      const colorMarks: ColorMarks = new Map()

      // First, establish what the cache value is before the revalidation.
      // (also check that it's actually consistent across dynamic HTML,
      // dynamic RSC, and segment prefetch)
      const { values: initialValues, texts: initialTexts } =
        await fetchAllSources({
          requestGetters,
          valuePattern,
        })
      assignColorMarks(colorMarks, initialValues)
      const initialValue = expectSameCacheValueInAllSources({
        values: initialValues,
        texts: initialTexts,
        valuePattern,
        debugLabel: `${name} (while establishing initial value)`,
        colorMarks,
      })

      debugPrint(
        `[${name}] initial value: ${formatValue(initialValue, colorMarks)}`
      )

      // Then revalidate the cached data. Note: Dynamic RSC requests don't trigger
      // actual revalidation - they only mark tags as needing revalidation.
      // The actual revalidation only occurs when accessing a static resource again.
      await next.fetch(`/revalidate?tag=${cacheTag}`, { method: 'POST' })

      // Then fetch the source and validate that it still contains the
      // same random number, which also triggers a revalidation.
      // The first request will get the stale data, but subsequent
      // requests will eventually get fresh data after the revalidation.
      const triggerSource = source
      debugPrint(
        `[${name}] requesting ${triggerSource} to trigger revalidation (timestamp: ${Date.now()})`
      )
      const { value: triggerValue } = await fetchSource({
        source: triggerSource,
        requestGetters,
        valuePattern,
      })
      assignColorMark(colorMarks, triggerValue)
      expect(triggerValue).toBe(initialValue)

      // Dynamic HTML, RSC, and segment should all eventually use the same
      // revalidated cache value.

      let revalidatedValue = await retry(
        async () => {
          const { value: currentValue } = await fetchSource({
            source,
            requestGetters,
            valuePattern,
          })
          assignColorMark(colorMarks, currentValue)

          if (currentValue === initialValue) {
            debugPrint(`⏳ ${source} has not finished revalidating yet`)
          } else {
            debugPrint(
              `✅ finished revalidating: ${formatValue(currentValue, colorMarks)}`
            )
          }

          // The cache value should be different from the initial one,
          // because we've triggered a revalidation.
          expect(currentValue).not.toBe(initialValue)
          return currentValue
        },
        POST_REVALIDATION_RETRY,
        undefined,
        `[${name}] ${source} should contain the revalidated cache value`
      )

      debugPrint(`[${name}] - revalidation finished, trying again soon...`)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      await retry(
        async () => {
          const { values, texts } = await fetchAllSources({
            requestGetters,
            valuePattern,
          })
          assignColorMarks(colorMarks, values)

          logCacheValues({
            initialValue,
            revalidatedValue,
            firstRequestSource: triggerSource,
            values,
            texts,
            colorMarks,
          })
          if (!isNextDeploy) {
            expectSameCacheValueInAllSources({
              values,
              texts,
              valuePattern,
              expectedValue: revalidatedValue,
              debugLabel: null,
              colorMarks,
            })
          } else {
            // In deploy mode, we don't seem to dedupe revalidations,
            // so the earlier revalidated value may end up being overwritten.
            // This is inefficient, but mostly fine, if the value is consistent.
            const currentValue = expectSameCacheValueInAllSources({
              values,
              texts,
              valuePattern,
              debugLabel: null,
              colorMarks,
            })
            if (currentValue !== revalidatedValue) {
              debugPrint(
                [
                  `⚠️ A newer prerender superseded the previous one:`,
                  `  previous : ${formatValue(revalidatedValue, colorMarks)}`,
                  `  current  : ${formatValue(currentValue, colorMarks)}`,
                ].join('\n')
              )
              revalidatedValue = currentValue
              throw new Error(
                `Retrying to see if value remains at ${currentValue}`
              )
            }
          }
        },
        POST_REVALIDATION_RETRY,
        undefined,
        `[${name}] all sources should contain the revalidated cache value`
      )
    }

    const testRevalidationConcurrent = async ({
      name,
      path,
      cacheTag,
      valuePattern,
      firstRequestAfterRevalidation,
    }: TestCase & {
      cacheTag: string
      firstRequestAfterRevalidation: Source | null
    }) => {
      debugPrint('='.repeat(80))
      logPaths(name, path, next)

      const requestGetters = createRequestGetters(next, path)
      const colorMarks: ColorMarks = new Map()

      // First, establish what the cache value is before the revalidation.
      // (also check that it's actually consistent across dynamic HTML,
      // dynamic RSC, and segment prefetch)
      const { values: initialValues, texts: initialTexts } =
        await fetchAllSources({
          requestGetters,
          valuePattern,
        })
      assignColorMarks(colorMarks, initialValues)
      const initialValue = expectSameCacheValueInAllSources({
        values: initialValues,
        texts: initialTexts,
        valuePattern,
        debugLabel: `${name} (while establishing initial value)`,
        colorMarks,
      })

      debugPrint(
        `[${name}] initial value: ${formatValue(initialValue, colorMarks)}`
      )

      // Then revalidate the cached data. Note: Dynamic RSC requests don't trigger
      // actual revalidation - they only mark tags as needing revalidation.
      // The actual revalidation only occurs when accessing a static resource again.
      await next.fetch(`/revalidate?tag=${cacheTag}`, { method: 'POST' })

      // Request the path (using the specified method) to trigger the revalidation.
      // The initial response should still contain the initial value. Subsequent
      // requests will eventually get fresh data after the revalidation.
      if (firstRequestAfterRevalidation !== null) {
        const triggerSource = firstRequestAfterRevalidation
        debugPrint(
          `[${name}] requesting ${triggerSource} to trigger revalidation (timestamp: ${Date.now()})`
        )
        const { value: triggerValue } = await fetchSource({
          source: triggerSource,
          valuePattern,
          requestGetters,
        })
        assignColorMark(colorMarks, triggerValue)
        expect(triggerValue).toBe(initialValue)
      } else {
        debugPrint(
          `[${name}] skipping trigger request (timestamp: ${Date.now()})`
        )
      }

      // Dynamic HTML, RSC, and segment should all eventually use the same
      // revalidated cache value.

      let revalidatedValue = await retry(
        async () => {
          const { values, texts } = await fetchAllSources({
            requestGetters,
            valuePattern,
          })
          assignColorMarks(colorMarks, values)

          logCacheValues({
            initialValue,
            firstRequestSource: firstRequestAfterRevalidation,
            values,
            texts,
            colorMarks,
          })

          // We should have a single cache value across all sources
          // (which may not happen immediately)
          // The cache value should be different from the initial one,
          // because we've triggered a revalidation.
          const currentValue = expectSameCacheValueInAllSources({
            values,
            texts,
            valuePattern,
            debugLabel: null,
            colorMarks,
          })
          expect(currentValue).not.toBe(initialValue)
          return currentValue
        },
        POST_REVALIDATION_RETRY,
        undefined,
        `[${name}] all sources should contain the revalidated cache value`
      )

      debugPrint(`[${name}] - revalidation finished, trying again soon...`)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      await retry(
        async () => {
          const { values, texts } = await fetchAllSources({
            requestGetters,
            valuePattern,
          })
          assignColorMarks(colorMarks, values)

          logCacheValues({
            initialValue,
            revalidatedValue,
            firstRequestSource: firstRequestAfterRevalidation,
            values,
            texts,
            colorMarks,
          })

          if (!isNextDeploy) {
            expectSameCacheValueInAllSources({
              values,
              texts,
              valuePattern,
              expectedValue: revalidatedValue,
              debugLabel: null,
              colorMarks,
            })
          } else {
            // In deploy mode, we don't seem to dedupe revalidations,
            // so the earlier revalidated value may end up being overwritten.
            // This is inefficient, but mostly fine, if the value is consistent.
            const currentValue = expectSameCacheValueInAllSources({
              values,
              texts,
              valuePattern,
              debugLabel: null,
              colorMarks,
            })
            if (currentValue !== revalidatedValue) {
              debugPrint(
                [
                  `⚠️ A newer prerender superseded the previous one:`,
                  `  previous : ${formatValue(revalidatedValue, colorMarks)}`,
                  `  current  : ${formatValue(currentValue, colorMarks)}`,
                ].join('\n')
              )
              revalidatedValue = currentValue
              throw new Error(
                `Retrying to see if value remains at ${currentValue}`
              )
            }
          }
        },
        POST_REVALIDATION_RETRY,
        undefined,
        `[${name}] all sources should contain the revalidated cache value`
      )
    }

    describe('use cache', () => {
      const valuePattern = /cache-random-.+?-\d+-\d+/

      it('initial', async () => {
        await testInitial({
          name: 'use cache - initial',
          path: '/use-cache/initial',
          valuePattern,
        })
      })

      describe('revalidation', () => {
        describe('single', () => {
          const createOpts = (
            source: Source
          ): Parameters<typeof testRevalidationSingle>[0] => {
            return {
              name: `use cache - revalidation - single - ${source}`,
              path: `/use-cache/revalidation/single/${source}`,
              cacheTag: `test-use-cache-revalidation-single.${source}`,
              valuePattern,
              source,
            }
          }

          it('when only HTML is requested', async () => {
            await testRevalidationSingle(createOpts('html'))
          })
          it('when only dynamic RSC is requested', async () => {
            await testRevalidationSingle(createOpts('rsc'))
          })
          // TODO: segment prefetches trigger a revalidation in deploy,
          // but not in `next start`
          // @gate !start
          it('when only a segment prefetch is requested', async () => {
            await testRevalidationSingle(createOpts('segment'))
          })
        })

        describe('concurrent', () => {
          const createOpts = (
            id: Source | 'all'
          ): Parameters<typeof testRevalidationConcurrent>[0] => {
            return {
              name: `use cache - revalidation - concurrent - ${id}`,
              path: `/use-cache/revalidation/concurrent/${id}`,
              cacheTag: `test-use-cache-revalidation-concurrent.${id}`,
              valuePattern,
              firstRequestAfterRevalidation: id === 'all' ? null : id,
            }
          }

          it('when HTML is requested first', async () => {
            await testRevalidationConcurrent(createOpts('html'))
          })
          it('when dynamic RSC is requested first', async () => {
            await testRevalidationConcurrent(createOpts('rsc'))
          })
          it('when a segment prefetch is requested first', async () => {
            await testRevalidationConcurrent(createOpts('segment'))
          })
          it('when all request kinds are done in parallel', async () => {
            await testRevalidationConcurrent(createOpts('all'))
          })
        })
      })
    })

    describe('fetch cache', () => {
      const valuePattern = /fetch-random-\d+-\d+\.\d+/

      it('initial', async () => {
        await testInitial({
          name: 'fetch cache - initial',
          path: '/fetch-cache/initial',
          valuePattern,
        })
      })

      describe('revalidation', () => {
        describe('single', () => {
          const createOpts = (
            source: Source
          ): Parameters<typeof testRevalidationSingle>[0] => {
            return {
              name: `fetch cache - revalidation - single - ${source}`,
              path: `/fetch-cache/revalidation/single/${source}`,
              cacheTag: `test-fetch-cache-revalidation-single.${source}`,
              valuePattern,
              source,
            }
          }

          it('when only HTML is requested', async () => {
            await testRevalidationSingle(createOpts('html'))
          })
          it('when only dynamic RSC is requested', async () => {
            await testRevalidationSingle(createOpts('rsc'))
          })
          // TODO: segment prefetches trigger a revalidation in deploy,
          // but not in `next start`
          // @gate !start
          it('when only a segment prefetch is requested', async () => {
            await testRevalidationSingle(createOpts('segment'))
          })
        })

        describe('concurrent', () => {
          const createOpts = (
            id: Source | 'all'
          ): Parameters<typeof testRevalidationConcurrent>[0] => {
            return {
              name: `fetch cache - revalidation - concurrent - ${id}`,
              path: `/fetch-cache/revalidation/concurrent/${id}`,
              cacheTag: `test-fetch-cache-revalidation-concurrent.${id}`,
              valuePattern,
              firstRequestAfterRevalidation: id === 'all' ? null : id,
            }
          }

          it('when HTML is requested first', async () => {
            await testRevalidationConcurrent(createOpts('html'))
          })
          it('when dynamic RSC is requested first', async () => {
            await testRevalidationConcurrent(createOpts('rsc'))
          })
          it('when a segment prefetch is requested first', async () => {
            await testRevalidationConcurrent(createOpts('segment'))
          })
          it('when all request kinds are done in parallel', async () => {
            await testRevalidationConcurrent(createOpts('all'))
          })
        })
      })
    })
  })

  it('should use RDC for server action re-renders', async () => {
    const url = '/server-action'
    const valuePattern = /cache-random-\d+\.\d+/

    const prerenderedCachedValue = await getPrerenderedValueFromPageSegment(
      next,
      url,
      valuePattern
    )

    // The values of the cache entry should be consistent across shell/resume.
    expectConsistentCacheValue(
      await next.render(url),
      valuePattern,
      prerenderedCachedValue
    )

    const browser = await next.browser(url, {
      pushErrorAsConsoleLog: true,
    })

    // Get the initial values
    const initialCachedValue = await browser
      .elementByCss('#cached-random')
      .text()
    const initialUncachedValue = await browser
      .elementByCss('#uncached-random')
      .text()

    expect(initialCachedValue).toBe(prerenderedCachedValue)

    // There should be no hydration errors due to a buildtime cache being
    // replaced by a new runtime cache
    await assertNoConsoleErrors(browser)

    await browser.elementByCss('#refresh-button').click()

    // Wait for the action to complete and verify:
    // 1. The uncached value should change
    // 2. The cached value should remain the same (proving RDC is being used)
    await retry(async () => {
      const cachedValueAfterAction = await browser
        .elementByCss('#cached-random')
        .text()
      const uncachedValueAfterAction = await browser
        .elementByCss('#uncached-random')
        .text()

      // Uncached value should have changed - this proves the action caused a re-render
      expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

      // Cached value should remain the same - this proves the RDC is being used
      // to maintain consistency during server action re-renders
      expect(cachedValueAfterAction).toBe(initialCachedValue)
    })
  })

  // TODO: flaky in deploy?
  it('should see fresh data after updateTag in server action with use cache', async () => {
    // This test verifies that when a server action calls updateTag(),
    // the subsequent re-render sees fresh data instead of stale RDC data.
    // This is the "read your own writes" behavior for 'use cache'.
    const url = '/revalidate-action'
    const valuePattern = /cache-random-\d+\.\d+/

    const prerenderedCachedValue = await getPrerenderedValueFromPageSegment(
      next,
      url,
      valuePattern
    )

    // The values of the cache entry should be consistent across shell/resume.
    expectConsistentCacheValue(
      await next.render(url),
      valuePattern,
      prerenderedCachedValue
    )

    const browser = await next.browser(url, {
      pushErrorAsConsoleLog: true,
    })

    // Get the initial cached value from the page render
    const initialCachedValue = await browser
      .elementByCss('#cached-value')
      .text()
    const initialUncachedValue = await browser
      .elementByCss('#uncached-value')
      .text()

    expect(initialCachedValue).toBe(prerenderedCachedValue)

    // There should be no hydration errors due to a buildtime cache being
    // replaced by a new runtime cache
    await assertNoConsoleErrors(browser)

    // Click the revalidate button to trigger the server action
    await browser.elementByCss('#revalidate-button').click()

    // Wait for the re-render and verify:
    // 1. The uncached value should change (proves re-render happened)
    // 2. The cached value should ALSO change (proves updateTag was respected)
    await retry(async () => {
      const cachedValueAfterAction = await browser
        .elementByCss('#cached-value')
        .text()
      const uncachedValueAfterAction = await browser
        .elementByCss('#uncached-value')
        .text()

      // Uncached value should change - this proves the action triggered a re-render
      expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

      // Cached value should also change, which proves that the RDC read respected
      // pendingRevalidatedTags and fetched fresh data instead of returning
      // the stale value from the RDC.
      // If this fails, it means the RDC is not respecting updateTag()
      // calls made during server actions
      expect(cachedValueAfterAction).not.toBe(initialCachedValue)
    })
  })

  it('should see fresh data after updateTag in server action with fetch cache', async () => {
    // This test verifies that when a server action calls updateTag(),
    // the subsequent re-render sees fresh data instead of stale RDC data.
    // This is the "read your own writes" behavior for fetch cache.
    const url = '/revalidate-fetch-action'
    const valuePattern = /fetch-random-\d+\.\d+/
    const prerenderedCachedValue = await getPrerenderedValueFromPageSegment(
      next,
      url,
      valuePattern
    )

    // The values of the cache entry should be consistent across shell/resume.
    expectConsistentCacheValue(
      await next.render(url),
      valuePattern,
      prerenderedCachedValue
    )

    const browser = await next.browser(url, {
      pushErrorAsConsoleLog: true,
    })

    // Get the initial cached value from the page render
    const initialCachedValue = await browser
      .elementByCss('#cached-value')
      .text()
    const initialUncachedValue = await browser
      .elementByCss('#uncached-value')
      .text()

    expect(initialCachedValue).toBe(prerenderedCachedValue)

    // There should be no hydration errors due to a buildtime cache being
    // replaced by a new runtime cache
    await assertNoConsoleErrors(browser)

    // Click the revalidate button to trigger the server action
    await browser.elementByCss('#revalidate-button').click()

    // Wait for the re-render and verify:
    // 1. The uncached value should change (proves re-render happened)
    // 2. The cached value should ALSO change (proves updateTag was respected)
    await retry(async () => {
      const cachedValueAfterAction = await browser
        .elementByCss('#cached-value')
        .text()
      const uncachedValueAfterAction = await browser
        .elementByCss('#uncached-value')
        .text()

      // Uncached value should change - this proves the action triggered a re-render
      expect(uncachedValueAfterAction).not.toBe(initialUncachedValue)

      // Cached value should also change, which proves that the RDC read respected
      // pendingRevalidatedTags and fetched fresh data instead of returning
      // the stale value from the RDC.
      // If this fails, it means the RDC is not respecting updateTag()
      // calls made during server actions
      expect(cachedValueAfterAction).not.toBe(initialCachedValue)
    })
  })
})

type Source = 'html' | 'segment' | 'rsc'

type CacheValuesBySource = Record<Source, ExtractedValue>
type RequestGetters = Record<Source, () => Promise<string>>

function createRequestGetters(
  next: NextInstance,
  path: string
): RequestGetters {
  return {
    html: () => next.render(path),
    rsc: () => fetchRSC(next, path).then((res) => res.text()),
    segment: () => fetchStaticPageSegment(next, path).then((res) => res.text()),
  }
}

async function fetchSource({
  source,
  requestGetters,
  valuePattern,
}: {
  requestGetters: Record<Source, () => Promise<string>>
  valuePattern: RegExp
  source: Source
}) {
  const text = await requestGetters[source]()
  const value = getValueFromText(text, valuePattern)
  return { text, value }
}

async function fetchAllSources({
  requestGetters,
  valuePattern,
}: {
  requestGetters: Record<Source, () => Promise<string>>
  valuePattern: RegExp
  firstRequestSource?: Source | null
}): Promise<{
  values: CacheValuesBySource
  texts: Record<Source, string>
}> {
  const promisesBySource = Object.fromEntries(
    Object.entries(requestGetters).map(([source, getter]) => [source, getter()])
  ) as Record<Source, Promise<string>>

  const texts = await promiseAllKeys(promisesBySource)

  const values: CacheValuesBySource = {
    // NOTE: `getValueFromText` also validates that we don't have multiple
    // inconsistent cache values in one response (which can happen e.g.
    // if a resume render does not use the RDC from its HTML shell)
    html: getValueFromText(texts.html, valuePattern),
    rsc: getValueFromText(texts.rsc, valuePattern),
    segment: getValueFromText(texts.segment, valuePattern),
  }
  return { values, texts }
}

function groupSourcesByCacheValue(
  values: CacheValuesBySource
): Map<ExtractedValue, Source[]> {
  // Track which cache value was present in which response.
  // It seems like we often end up with different values
  // in different responses until the revalidation properly settles,
  // so this is useful for debugging failures.
  const sourcesWithValue = new Map<ExtractedValue, Source[]>()
  for (const [rawSource, cacheValue] of Object.entries(values)) {
    const source = rawSource as keyof typeof values
    pushIntoArrayMap(sourcesWithValue, cacheValue, source)
  }
  return sourcesWithValue
}

function pushIntoArrayMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  let arr = map.get(key)
  if (!arr) {
    map.set(key, (arr = []))
  }
  arr.push(value)
}

function expectSameCacheValueInAllSources({
  values,
  texts,
  valuePattern,
  expectedValue = null,
  debugLabel,
  colorMarks,
}: {
  values: CacheValuesBySource
  texts: Record<Source, string>
  valuePattern: RegExp
  expectedValue?: ExtractedValue | null
  debugLabel: string | null
  colorMarks: ColorMarks
}): ExtractedValue {
  const sourcesWithValue = groupSourcesByCacheValue(values)
  // All requests should show the same cache value.
  // (if we get multiple values, the map will have multiple entries).
  // Assert on the contents instead of just checking the length to
  // make debugging failures easier.
  const entries = [...sourcesWithValue]
  try {
    const valueMatcher =
      expectedValue !== null
        ? expectedValue
        : expect.stringMatching(valuePattern)
    expect(entries).toEqual<typeof entries>([
      [valueMatcher, Object.keys(values) as Source[]],
    ])
  } catch (err) {
    if (debugLabel !== null) {
      const messageLines = [
        'Found inconsistent cache values',
        `Context: ${debugLabel}`,
        '',
      ]
      for (const [source, value] of Object.entries(values)) {
        messageLines.push(
          `  ${source.padEnd(8)}: ${formatValue(value, colorMarks)}`
        )
      }
      messageLines.push('')
      for (const [rawSource, text] of Object.entries(texts)) {
        const source = rawSource as Source
        messageLines.push(
          '----------------------------------------------',
          `raw body for ${source}:`,
          '',
          text,
          ''
        )
      }
      debugPrint(messageLines.join('\n'))
    }
    throw err
  }

  // If the above passed, we have a single cache value across all sources.
  // The cache value should be different from the initial one,
  // because we've triggered a revalidation
  // (before revalidation they would all get the same one)
  const cacheValue = getFirstItem(sourcesWithValue.keys())!
  return cacheValue
}

function logCacheValues({
  initialValue,
  revalidatedValue = null,
  firstRequestSource,
  values,
  texts,
  colorMarks,
}: {
  initialValue: ExtractedValue
  revalidatedValue?: ExtractedValue | null
  firstRequestSource: Source | null
  values: CacheValuesBySource
  texts: AllKeysAwaited<Record<Source, Promise<string>>>
  colorMarks: ColorMarks
}) {
  const sourcesWithValue = new Map<ExtractedValue, (Source | 'revalidated')[]>(
    groupSourcesByCacheValue(values)
  )
  if (revalidatedValue !== null) {
    // NOTE: adding the expected revalidated value makes the code below
    // log "Got inconsistent cache values" if the expected value is different
    // from what we're seeing
    pushIntoArrayMap(sourcesWithValue, revalidatedValue, 'revalidated')
  }

  if (sourcesWithValue.size === 1) {
    const currentValue = getFirstItem(sourcesWithValue.keys())!
    if (currentValue === initialValue) {
      debugPrint(
        `⏳ HTML, RSC, and segment requests have not finished revalidating yet`
      )
    } else {
      debugPrint(
        `✅ HTML, RSC, and segment requests all have a consistent revalidated value: ${formatValue(currentValue, colorMarks)}`
      )
    }
  } else {
    const messageLines = [
      `❌ Got inconsistent cache values: (${firstRequestSource === null ? 'requested in parallel' : firstRequestSource + ' requested first'})`,
      `  ${'initial'.padEnd(12)}: ${formatValue(initialValue, colorMarks)}`,
      ...(revalidatedValue !== null
        ? [
            `  ${'revalidated'.padEnd(12)}: ${formatValue(revalidatedValue, colorMarks)}`,
          ]
        : []),
      `  ${'html'.padEnd(12)}: ${formatValue(values.html, colorMarks)}`,
      `  ${'rsc'.padEnd(12)}: ${formatValue(values.rsc, colorMarks)}`,
      `  ${'segment'.padEnd(12)}: ${formatValue(values.segment, colorMarks)}`,
    ]

    // RDC info can be enabled by setting the `SHOW_RDC_INFO` environment variable.
    for (const [source, text] of Object.entries(texts)) {
      const rdcs = parseRDCInfo(text)
      if (rdcs.length === 0) {
        continue
      }
      messageLines.push(
        `${source} RDC: ${inspect(rdcs.length === 1 ? rdcs[0] : rdcs)}`
      )
    }
    debugPrint(messageLines.join('\n'))
  }
}

type ColorMarks = Map<ExtractedValue, string>
const COLOR_MARKS_ORDER = [
  // initial value, pre-revalidation
  '⚪',
  // revalidated values
  '🟦',
  '🟨',
  '🟪',
  '🟩',
  '🟥',
  '🟧',
  '🟫',
]

function assignColorMarks(
  colorMarks: ColorMarks,
  values: Record<Source, ExtractedValue>
) {
  for (const cacheValue of Object.values(values)) {
    assignColorMark(colorMarks, cacheValue)
  }
}

function assignColorMark(colorMarks: ColorMarks, cacheValue: ExtractedValue) {
  if (colorMarks.has(cacheValue)) {
    return
  }

  // Find a mark we haven't used yet.
  const nextMarkIndex = colorMarks.size
  const newMark = COLOR_MARKS_ORDER[nextMarkIndex] ?? `#${nextMarkIndex}`
  colorMarks.set(cacheValue, newMark)
}

function formatValue(value: ExtractedValue, colorMarks: ColorMarks) {
  const colorMark = colorMarks.get(value)
  if (colorMark === undefined) {
    return `"${value}"`
  }
  return `${colorMark} "${value}"`
}

function parseRDCInfo(text: string) {
  return [...text.matchAll(/BEGIN_RDC_INFO\.(.*?)\.END_RDC_INFO/g)].map(
    (match) => JSON.parse(atob(match[1]))
  )
}

function expectConsistentCacheValue(
  text: string,
  valuePattern: RegExp,
  expectedValue: string
) {
  expect(getUniqueRegexMatches(text, valuePattern)).toEqual([expectedValue])
}

function getUniqueRegexMatches(text: string, pattern: RegExp) {
  const uniqueMatches = new Set<string>()
  for (const match of text.matchAll(
    new RegExp(pattern.source, pattern.flags + 'g')
  )) {
    // `matchAll` returns a match array for each occurence.
    // We don't care about groups, so just take the whole match.
    uniqueMatches.add(match[0])
  }
  return [...uniqueMatches]
}

async function getPrerenderedValueFromPageSegment(
  next: NextInstance,
  url: string,
  valuePattern: RegExp
) {
  const prerendered = await fetchStaticPageSegment(next, url).then((res) =>
    res.text()
  )
  return getValueFromText(prerendered, valuePattern)
}

type ExtractedValue = string & { __brand: 'ExtractedValue' | undefined }

function getValueFromText(text: string, valuePattern: RegExp): ExtractedValue {
  const values = getUniqueRegexMatches(text, valuePattern)
  if (values.length === 0) {
    throw new Error(
      `Value pattern not found in prerender: ${valuePattern.source}\n\nText:\n\n${text}`
    )
  }
  if (values.length > 1) {
    throw new Error(
      `Found multiple values matching pattern: ${valuePattern.source}\n\nText:\n${text}`
    )
  }
  return values[0] as ExtractedValue
}

async function fetchRSC(next: NextInstance, url: string) {
  return await fetchWithRSCCacheBuster(next, url, {
    headers: {
      RSC: '1',
    },
  })
}

async function fetchStaticPageSegment(next: NextInstance, url: string) {
  const pathname = new URL(url, 'http://__n').pathname
  return await fetchWithRSCCacheBuster(next, url, {
    headers: {
      RSC: '1',
      'Next-Router-Prefetch': '1',
      'Next-Router-Segment-Prefetch': pathname + '/__PAGE__',
    },
  })
}

async function fetchWithRSCCacheBuster(
  next: NextInstance,
  rawUrl: string,
  opts: RequestInit
): Promise<Response> {
  // convert to Headers to normalize header casing
  const headers = new Headers(opts.headers ?? {})

  const urlObject = new URL(rawUrl, next.url)
  urlObject.searchParams.set(
    '_rsc',
    await computeCacheBustingSearchParam(
      (headers.get('next-router-prefetch') ?? undefined) as Parameters<
        typeof computeCacheBustingSearchParam
      >[0],
      headers.get('next-router-segment-prefetch') ?? undefined,
      headers.get('next-router-state-tree') ?? undefined,
      headers.get('next-url') ?? undefined
    )
  )
  const url = urlObject.href
  const response = await next.fetch(url, {
    ...opts,
    headers,
  })
  if (response.url !== url) {
    console.error('URL mismatch with response (likely redirect)', {
      url,
      'response.url': response.url,
    })
  }
  return response
}

type AllKeysAwaited<TObj extends Record<string, Promise<any>>> = {
  [key in keyof TObj]: Awaited<TObj[key]>
}
async function promiseAllKeys<TObj extends Record<string, Promise<any>>>(
  record: TObj
): Promise<AllKeysAwaited<TObj>> {
  const keys = Object.keys(record) as (keyof TObj)[]
  const promises = Object.values(record)
  const promiseResults = await Promise.all(promises)

  const result: Partial<AllKeysAwaited<TObj>> = {}
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = promiseResults[i]
  }
  return result as AllKeysAwaited<TObj>
}

function getFirstItem<T>(iter: Iterator<T>): T | null {
  const item = iter.next()
  if (item.done) {
    return null
  } else {
    return item.value as T
  }
}
