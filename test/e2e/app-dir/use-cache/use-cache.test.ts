import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import { format } from 'util'
import { BrowserInterface } from 'next-webdriver'
import {
  createRenderResumeDataCache,
  RenderResumeDataCache,
} from 'next/dist/server/resume-data-cache/resume-data-cache'

const GENERIC_RSC_ERROR =
  'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details. A digest property is included on this error instance which may provide additional details about the nature of the error.'

describe('use-cache', () => {
  const { next, isNextDev, isNextDeploy, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results', async () => {
    const browser = await next.browser(`/?n=1`)
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1a = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=2`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('2')
    const random2 = await browser.waitForElementByCss('#y').text()

    await browser.loadPage(new URL(`/?n=1&unrelated`, next.url).toString())
    expect(await browser.waitForElementByCss('#x').text()).toBe('1')
    const random1b = await browser.waitForElementByCss('#y').text()

    // The two navigations to n=1 should use a cached value.
    expect(random1a).toBe(random1b)

    // The navigation to n=2 should be some other random value.
    expect(random1a).not.toBe(random2)

    // Client component should have rendered.
    expect(await browser.waitForElementByCss('#z').text()).toBe('foo')

    // Client component child should have rendered but not invalidated the cache.
    expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
  })

  if (!process.env.TURBOPACK_BUILD) {
    it('should cache results custom handler', async () => {
      const browser = await next.browser(`/custom-handler?n=1`)
      expect(await browser.waitForElementByCss('#x').text()).toBe('1')
      const random1a = await browser.waitForElementByCss('#y').text()

      await browser.loadPage(
        new URL(`/custom-handler?n=2`, next.url).toString()
      )
      expect(await browser.waitForElementByCss('#x').text()).toBe('2')
      const random2 = await browser.waitForElementByCss('#y').text()

      await browser.loadPage(
        new URL(`/custom-handler?n=1&unrelated`, next.url).toString()
      )
      expect(await browser.waitForElementByCss('#x').text()).toBe('1')
      const random1b = await browser.waitForElementByCss('#y').text()

      // The two navigations to n=1 should use a cached value.
      expect(random1a).toBe(random1b)

      // The navigation to n=2 should be some other random value.
      expect(random1a).not.toBe(random2)

      // Client component child should have rendered but not invalidated the cache.
      expect(await browser.waitForElementByCss('#r').text()).toContain('rnd')
    })
  }

  it('should cache complex args', async () => {
    // Use two bytes that can't be encoded as UTF-8 to ensure serialization works.
    const browser = await next.browser('/complex-args?n=a1')
    const a1a = await browser.waitForElementByCss('#x').text()
    expect(a1a.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2a = await browser.waitForElementByCss('#x').text()
    expect(e2a.slice(0, 2)).toBe('e2')

    expect(a1a).not.toBe(e2a)

    await browser.loadPage(new URL('/complex-args?n=a1', next.url).toString())
    const a1b = await browser.waitForElementByCss('#x').text()
    expect(a1b.slice(0, 2)).toBe('a1')

    await browser.loadPage(new URL('/complex-args?n=e2', next.url).toString())
    const e2b = await browser.waitForElementByCss('#x').text()
    expect(e2b.slice(0, 2)).toBe('e2')

    // The two navigations to n=1 should use a cached value.
    expect(a1a).toBe(a1b)
    expect(e2a).toBe(e2b)
  })

  it('should dedupe with react cache inside "use cache"', async () => {
    const browser = await next.browser('/react-cache')
    const a = await browser.waitForElementByCss('#a').text()
    const b = await browser.waitForElementByCss('#b').text()
    expect(a).toBe(b)
  })

  it('should return the same object reference for multiple invocations', async () => {
    const browser = await next.browser('/referential-equality')
    expect(await browser.elementById('same-arg').text()).toBe('true')
    expect(await browser.elementById('different-args').text()).toBe('true')
    expect(await browser.elementById('same-bound-arg').text()).toBe('true')
    expect(await browser.elementById('different-bound-args').text()).toBe(
      'true'
    )
  })

  it('should dedupe cached data in the RSC payload', async () => {
    const text = await next
      .fetch('/rsc-payload')
      .then((response) => response.text())

    // The cached data is passed to two client components, but should appear
    // only once in the RSC payload that's included in the HTML document.
    expect(text).toIncludeRepeated(
      '{\\\\"data\\\\":{\\\\"hello\\\\":\\\\"world\\\\"}',
      1
    )
  })

  it('should error when cookies/headers/draftMode is used inside "use cache"', async () => {
    const browser = await next.browser('/errors')

    await retry(async () => {
      expect(await browser.elementById('cookies').text()).toContain(
        isNextDev
          ? 'Route /errors used "cookies" inside "use cache".'
          : GENERIC_RSC_ERROR
      )
      expect(await browser.elementById('headers').text()).toContain(
        isNextDev
          ? 'Route /errors used "headers" inside "use cache".'
          : GENERIC_RSC_ERROR
      )
    })

    expect(await browser.elementById('draft-mode').text()).toContain(
      'Editing: false'
    )

    // CLI assertions are skipped in deploy mode because `next.cliOutput` will only contain build-time logs.
    if (!isNextDeploy) {
      expect(next.cliOutput).toContain(
        'Route /errors used "cookies" inside "use cache". '
      )
      expect(next.cliOutput).toContain(
        'Route /errors used "headers" inside "use cache". '
      )
    }
  })

  it('should cache results in route handlers', async () => {
    const response = await next.fetch('/api')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })

  it('should cache results for cached functions imported from client components', async () => {
    const browser = await next.browser('/imported-from-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/\d\.\d+ \d\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  it('should cache results for cached functions passed to client components', async () => {
    const browser = await next.browser('/passed-to-client')
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')
    await browser.elementById('submit-button').click()

    let threeRandomValues: string

    await retry(async () => {
      threeRandomValues = await browser.elementByCss('p').text()
      expect(threeRandomValues).toMatch(/100\.\d+ 100\.\d+ 100\.\d+/)
    })

    await browser.elementById('reset-button').click()
    expect(await browser.elementByCss('p').text()).toBe('0 0 0')

    await browser.elementById('submit-button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(threeRandomValues)
    })
  })

  // TODO: pending tags handling on deploy
  if (!isNextDeploy) {
    it('should update after unstable_expireTag correctly', async () => {
      const browser = await next.browser('/cache-tag')
      const initial = await browser.elementByCss('#a').text()

      // Bust the ISR cache first, to populate the in-memory cache for the
      // subsequent unstable_expireTag calls.
      await browser.elementByCss('#revalidate-path').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).not.toBe(initial)
      })

      let valueA = await browser.elementByCss('#a').text()
      let valueB = await browser.elementByCss('#b').text()
      let valueF1 = await browser.elementByCss('#f1').text()
      let valueF2 = await browser.elementByCss('#f2').text()
      let valueR1 = await browser.elementByCss('#r1').text()
      let valueR2 = await browser.elementByCss('#r2').text()

      await browser.elementByCss('#revalidate-a').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
        expect(await browser.elementByCss('#b').text()).toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
      })

      valueA = await browser.elementByCss('#a').text()

      await browser.elementByCss('#revalidate-b').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).toBe(valueA)
        expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
      })

      valueB = await browser.elementByCss('#b').text()

      await browser.elementByCss('#revalidate-c').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
        expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
      })

      valueA = await browser.elementByCss('#a').text()
      valueB = await browser.elementByCss('#b').text()
      valueF1 = await browser.elementByCss('#f1').text()
      valueR1 = await browser.elementByCss('#r1').text()

      await browser.elementByCss('#revalidate-f').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).toBe(valueA)
        expect(await browser.elementByCss('#b').text()).toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
      })

      valueF1 = await browser.elementByCss('#f1').text()

      await browser.elementByCss('#revalidate-r').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).toBe(valueA)
        expect(await browser.elementByCss('#b').text()).toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).toBe(valueR2)
      })

      valueR1 = await browser.elementByCss('#r1').text()

      await browser.elementByCss('#revalidate-path').click()
      await retry(async () => {
        expect(await browser.elementByCss('#a').text()).not.toBe(valueA)
        expect(await browser.elementByCss('#b').text()).not.toBe(valueB)
        expect(await browser.elementByCss('#f1').text()).not.toBe(valueF1)
        expect(await browser.elementByCss('#f2').text()).not.toBe(valueF2)
        expect(await browser.elementByCss('#r1').text()).not.toBe(valueR1)
        expect(await browser.elementByCss('#r2').text()).not.toBe(valueR2)
      })
    })
  }

  if (isNextStart) {
    it('should prerender fully cacheable pages as static HTML', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      let prerenderedRoutes = Object.keys(prerenderManifest.routes).sort()

      if (process.env.__NEXT_EXPERIMENTAL_PPR === 'true') {
        // For the purpose of this test we don't consider an incomplete shell.
        prerenderedRoutes = prerenderedRoutes.filter((route) => {
          const filename = route.replace(/^\//, '').replace(/^$/, 'index')

          return next
            .readFileSync(`.next/server/app/${filename}.html`)
            .endsWith('</html>')
        })
      }

      expect(prerenderedRoutes).toEqual([
        // [id] route, first entry in generateStaticParams
        expect.stringMatching(/\/a\d/),
        // [id] route, second entry in generateStaticParams
        expect.stringMatching(/\/b\d/),
        '/cache-fetch',
        '/cache-fetch-no-store',
        '/cache-life',
        '/cache-tag',
        '/form',
        '/imported-from-client',
        '/logs',
        '/method-props',
        '/not-found',
        '/passed-to-client',
        '/react-cache',
        '/referential-equality',
        '/rsc-payload',
        '/static-class-method',
        '/use-action-state',
        '/with-server-action',
      ])
    })

    it('should match the expected revalidate config on the prerender manifest', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )

      expect(prerenderManifest.version).toBe(4)
      expect(
        prerenderManifest.routes['/cache-life'].initialRevalidateSeconds
      ).toBe(100)

      // The revalidate config from the fetch call should lower the revalidate
      // config for the page.
      expect(
        prerenderManifest.routes['/cache-tag'].initialRevalidateSeconds
      ).toBe(42)
    })

    it('should match the expected stale config in the page header', async () => {
      const meta = JSON.parse(
        await next.readFile('.next/server/app/cache-life.meta')
      )
      expect(meta.headers['x-nextjs-stale-time']).toBe('19')
    })

    it('should propagate unstable_cache tags correctly', async () => {
      const meta = JSON.parse(
        await next.readFile('.next/server/app/cache-tag.meta')
      )
      expect(meta.headers['x-next-cache-tags']).toContain('a,c,b,f,r')
    })
  }

  it('can reference server actions in "use cache" functions', async () => {
    const browser = await next.browser('/with-server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  // TODO(useCache): Re-activate for deploy tests when NAR-85 is resolved.
  if (!isNextDeploy) {
    it('should be able to revalidate a page using unstable_expireTag', async () => {
      const browser = await next.browser(`/form`)
      const time1 = await browser.waitForElementByCss('#t').text()

      await browser.loadPage(new URL(`/form`, next.url).toString())

      const time2 = await browser.waitForElementByCss('#t').text()

      expect(time1).toBe(time2)

      await browser.elementByCss('#refresh').click()

      await waitFor(500)

      const time3 = await browser.waitForElementByCss('#t').text()

      expect(time3).not.toBe(time2)

      // Reloading again should ideally be the same value but because the Action seeds
      // the cache with real params as the argument it has a different cache key.
      // await browser.loadPage(new URL(`/form?c`, next.url).toString())
      // const time4 = await browser.waitForElementByCss('#t').text()
      // expect(time4).toBe(time3);
    })
  }

  it('should use revalidate config in fetch', async () => {
    const browser = await next.browser('/fetch-revalidate')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).not.toBe(initialValue)
  })

  it('should cache fetch without no-store', async () => {
    const browser = await next.browser('/cache-fetch')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  it('should override fetch with no-store in use cache properly', async () => {
    const browser = await next.browser('/cache-fetch-no-store')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  it('should override fetch with cookies/auth in use cache properly', async () => {
    const browser = await next.browser('/cache-fetch-auth-header')

    const initialValue = await browser.elementByCss('#random').text()
    await browser.refresh()

    expect(await browser.elementByCss('#random').text()).toBe(initialValue)
  })

  it('works with useActionState if previousState parameter is not used in "use cache" function', async () => {
    const browser = await next.browser('/use-action-state')

    let value = await browser.elementByCss('p').text()
    expect(value).toBe('-1')

    await browser.elementByCss('button').click()

    await retry(async () => {
      value = await browser.elementByCss('p').text()
      expect(value).toMatch(/\d\.\d+/)
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(value)
    })
  })

  it('works with "use cache" in method props', async () => {
    const browser = await next.browser('/method-props')

    let [value1, value2] = await Promise.all([
      browser.elementByCss('#form-1 p').text(),
      browser.elementByCss('#form-2 p').text(),
    ])

    expect(value1).toBe('-1')
    expect(value2).toBe('-1')

    await browser.elementByCss('#form-1 button').click()

    await retry(async () => {
      value1 = await browser.elementByCss('#form-1 p').text()
      expect(value1).toMatch(/1\.\d+/)
    })

    await browser.elementByCss('#form-2 button').click()

    await retry(async () => {
      value2 = await browser.elementByCss('#form-2 p').text()
      expect(value2).toMatch(/2\.\d+/)
    })

    await browser.elementByCss('#form-1 button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-1 p').text()).toBe(value1)
    })

    await browser.elementByCss('#form-2 button').click()

    await retry(async () => {
      expect(await browser.elementByCss('#form-2 p').text()).toBe(value2)
    })
  })

  it('works with "use cache" in static class methods', async () => {
    const browser = await next.browser('/static-class-method')

    let value = await browser.elementByCss('p').text()

    expect(value).toBe('-1')

    await browser.elementByCss('button').click()

    await retry(async () => {
      value = await browser.elementByCss('p').text()
      expect(value).toMatch(/\d\.\d+/)
    })

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe(value)
    })
  })

  it('renders the not-found page when `notFound()` is used', async () => {
    const browser = await next.browser('/not-found')
    const text = await browser.elementByCss('h2').text()
    expect(text).toBe('This page could not be found.')
  })

  if (isNextDev) {
    it('should not have unhandled rejection of Request data promises when use cache is enabled without dynamicIO', async () => {
      await next.render('/unhandled-promise-regression')
      // We assert both to better defend against changes in error messaging invalidating this test silently.
      // They are today asserting the same thing
      expect(next.cliOutput).not.toContain(
        'During prerendering, `cookies()` rejects when the prerender is complete.'
      )
      expect(next.cliOutput).not.toContain(
        'During prerendering, `headers()` rejects when the prerender is complete.'
      )
      expect(next.cliOutput).not.toContain(
        'During prerendering, `connection()` rejects when the prerender is complete.'
      )
      expect(next.cliOutput).not.toContain('HANGING_PROMISE_REJECTION')
    })

    it('replays logs from "use cache" functions', async () => {
      const browser = await next.browser('/logs')
      const initialLogs = await getSanitizedLogs(browser)

      // We ignore the logged time string at the end of this message:
      const logMessageWithDateRegexp =
        /^ Server {3}Cache {3}Cache {2}deep inside /

      let logMessageWithCachedDate: string | undefined

      await retry(async () => {
        // TODO(veil): We might want to show only the original (right-most)
        // environment badge when caches are nested.
        expect(initialLogs).toMatchObject(
          expect.arrayContaining([
            ' Server  outside',
            ' Server   Cache  inside',
            expect.stringMatching(logMessageWithDateRegexp),
          ])
        )

        logMessageWithCachedDate = initialLogs.find((log) =>
          logMessageWithDateRegexp.test(log)
        )

        expect(logMessageWithCachedDate).toBeDefined()
      })

      // Load the page again and expect the cached logs to be replayed again.
      // We're using an explicit `loadPage` instead of `refresh` here, to start
      // with an empty set of logs.
      await browser.loadPage(await browser.url())

      await retry(async () => {
        const newLogs = await getSanitizedLogs(browser)

        expect(newLogs).toMatchObject(
          expect.arrayContaining([
            ' Server  outside',
            ' Server   Cache  inside',
            logMessageWithCachedDate,
          ])
        )
      })
    })
  }

  if (isNextStart && process.env.__NEXT_EXPERIMENTAL_PPR === 'true') {
    it('should exclude inner caches from the resume data cache (RDC)', async () => {
      await next.fetch('/rdc')

      const resumeDataCache = extractResumeDataCacheFromPostponedState(
        JSON.parse(await next.readFile('.next/server/app/rdc.meta')).postponed
      )

      const cacheKeys = Array.from(resumeDataCache.cache.keys())

      // There should be no cache entry for the "middle" cache function, because
      // it's only used inside another cache scope ("outer"). Whereas "inner" is
      // also used inside a prerender scope (the page). Note: We're matching on
      // the "id" args that are encoded into the respective cache keys.
      expect(cacheKeys).toMatchObject([
        expect.stringContaining('["outer"]'),
        expect.stringContaining('["inner"]'),
      ])
    })
  }
})

async function getSanitizedLogs(browser: BrowserInterface): Promise<string[]> {
  const logs = await browser.log({ includeArgs: true })

  return logs.map(({ args }) =>
    format(
      ...args.map((arg) => (typeof arg === 'string' ? stripAnsi(arg) : arg))
    )
  )
}

function extractResumeDataCacheFromPostponedState(
  state: string
): RenderResumeDataCache {
  const postponedStringLengthMatch = state.match(/^([0-9]*):/)![1]
  const postponedStringLength = parseInt(postponedStringLengthMatch)

  return createRenderResumeDataCache(
    state.slice(postponedStringLengthMatch.length + postponedStringLength + 1)
  )
}
