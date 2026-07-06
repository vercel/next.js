import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

describe('Instrumentation Client Hook', () => {
  describe.each([
    {
      name: 'With src folder',
      appDir: 'app-with-src',
      shouldLog: false,
    },
    {
      name: 'App Router',
      appDir: 'app-router',
      shouldLog: true,
    },
    {
      name: 'Pages Router',
      appDir: 'pages-router',
      shouldLog: false,
    },
  ])('$name', ({ name, appDir, shouldLog }) => {
    describe(name, () => {
      const { next, isNextDev } = nextTestSetup({
        files: path.join(__dirname, appDir),
      })

      it(`should execute instrumentation-client from ${name.toLowerCase()} before hydration`, async () => {
        const browser = await next.browser('/')

        const instrumentationTime = await browser.eval(
          `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
        )
        const hydrationTime = await browser.eval(`window.__NEXT_HYDRATED_AT`)

        expect(instrumentationTime).toBeDefined()
        expect(hydrationTime).toBeDefined()
        expect(instrumentationTime).toBeLessThan(hydrationTime)
        expect(
          (await browser.log()).some((log) =>
            log.message.startsWith(
              '[Client Instrumentation Hook] Slow execution detected'
            )
          )
        ).toBe(isNextDev && shouldLog)
      })
    })
  })

  function filterNavigationStartLogs(logs: Array<{ message: string }>) {
    const result = []
    for (const log of logs) {
      if (log.message.startsWith('[Router Transition Start]')) {
        result.push(log.message)
      }
    }
    return result
  }

  describe('onRouterTransitionStart', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'app-router'),
    })

    it('onRouterTransitionStart fires at the start of a navigation', async () => {
      const browser = await next.browser('/')

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      const linkToHome = await browser.elementByCss('a[href="/"]')
      await linkToHome.click()
      await browser.elementById('home')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page',
        '[Router Transition Start] [push] /',
      ])
    })

    it('onRouterTransitionStart fires at the start of a back/forward navigation', async () => {
      const browser = await next.browser('/')

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      await browser.back()
      await browser.elementById('home')

      await browser.forward()
      await browser.elementById('some-page')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page',
        '[Router Transition Start] [traverse] /',
        '[Router Transition Start] [traverse] /some-page',
      ])
    })

    it('preserves the legacy two-argument start hook without the experimental flag', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      expect(
        await browser.eval(`
          window.__ROUTER_TRANSITION_EVENTS.map((event) => ({
            phase: event.phase,
            hasEvent: event.event != null,
          }))
        `)
      ).toEqual([{ phase: 'start', hasEvent: false }])
    })
  })

  describe('router transition lifecycle', () => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'app-router'),
      nextConfig: {
        experimental: {
          instrumentationClientRouterTransitionEvents: true,
        },
      },
    })

    async function getTransitionEvents(browser) {
      return browser.eval(`window.__ROUTER_TRANSITION_EVENTS`)
    }

    it('reports the from route on start', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      const [start] = await getTransitionEvents(browser)
      expect(start.phase).toBe('start')
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(typeof start.event.id).toBe('string')
      expect(start.event.timestamp).toBeGreaterThan(0)
      // The `from` route describes the page we navigated away from (the home
      // page).
      expect(start.event.from.routes).toEqual([{ template: '/', params: [] }])
      expect(start.event.from.renderedPathname).toBe('/')
      expect(start.event.from.searchParams).toEqual({})
      // The event carries exactly id/timestamp/from — in particular no
      // prefetchIntent and no raw router tree.
      expect(Object.keys(start.event).sort()).toEqual([
        'from',
        'id',
        'timestamp',
      ])
      expect(Object.keys(start.event.from).sort()).toEqual([
        'canonicalUrl',
        'renderedPathname',
        'routes',
        'searchParams',
      ])
    })

    it('reports a commit with a to route and the same id as its start', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(commit.navigateType).toBe('push')
      expect(commit.event.id).toBe(start.event.id)
      expect(commit.event.timestamp).toBeGreaterThanOrEqual(
        start.event.timestamp
      )
      expect(commit.event.to.routes).toEqual([
        { template: '/some-page', params: [] },
      ])
      expect(commit.event.to.renderedPathname).toBe('/some-page')
    })

    it('completes the lifecycle for a route that was not prefetched', async () => {
      const browser = await next.browser('/')

      // Without a prefetch the destination state is produced asynchronously
      // (the router blocks on the dynamic fetch); the commit must still be
      // reported once that state is applied.
      await browser.elementById('push-no-prefetch').click()
      await browser.elementById('no-prefetch')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.url === '/no-prefetch'
        )
        expect(commit?.event.to.renderedPathname).toBe('/no-prefetch')
      })
    })

    it('aborts an in-flight transition replaced before it commits', async () => {
      const browser = await next.browser('/')

      await browser.elementById('abort-double-push').click()
      await browser.elementById('dashboard')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'abort')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const commit = events.find((e) => e.phase === 'commit')
      const abort = events.find((e) => e.phase === 'abort')
      // The later navigation (/dashboard) commits; the earlier (/some-page) is
      // aborted, attributed to the commit that replaced it.
      expect(commit.url).toBe('/dashboard')
      expect(abort.url).toBe('/some-page')
      expect(abort.event.replacedBy).toBe(commit.event.id)
    })

    it('emits matching trees for a hash-only navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-hash').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      // A hash-only navigation doesn't change the route, so the route identity
      // (everything but the hash-bearing canonicalUrl) is unchanged — that's
      // what consumers group by.
      expect(commit.event.to.canonicalUrl).toBe('/#section')
      expect(commit.event.to.routes).toEqual(start.event.from.routes)
      expect(commit.event.to.renderedPathname).toBe(
        start.event.from.renderedPathname
      )
      expect(commit.event.to.searchParams).toEqual(
        start.event.from.searchParams
      )

      // Traversing back across the hash boundary reuses the tree the same
      // way, so the traverse commit reports the same unchanged route.
      await browser.back()
      await retry(async () => {
        const traverseCommit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.navigateType === 'traverse'
        )
        expect(traverseCommit?.event.to.routes).toEqual(start.event.from.routes)
      })
    })

    it('reports a traverse navigation on back/forward', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await browser.back()
      await browser.elementById('home')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(
          events.some(
            (e) => e.phase === 'commit' && e.navigateType === 'traverse'
          )
        ).toBe(true)
      })

      const traverseCommit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit' && e.navigateType === 'traverse'
      )
      expect(traverseCommit.event.to.routes).toEqual([
        { template: '/', params: [] },
      ])
    })

    it('renders dynamic segments as positional holes with positional params', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/blog/hello"]').click()
      await browser.elementById('blog-post')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      expect(commit.event.to.routes).toEqual([
        { template: '/blog/:1', params: ['hello'] },
      ])
      expect(commit.event.to.renderedPathname).toBe('/blog/hello')
    })

    it('reports the post-rewrite pathname and search params for a middleware rewrite', async () => {
      const browser = await next.browser('/')

      // Middleware rewrites /rewrite-source to /rewrite-target and adds an
      // `internal` search param (keeping the user's `q`).
      await browser
        .elementByCss('a[href="/rewrite-source?q=from-user"]')
        .click()
      await browser.elementById('rewrite-target')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      // The address bar keeps the URL the user navigated to...
      expect(commit.event.to.canonicalUrl).toBe('/rewrite-source?q=from-user')
      // ...while the rendered pathname, route templates, and search params
      // are post-rewrite: they describe what the server actually rendered,
      // including the search param the middleware added.
      expect(commit.event.to.renderedPathname).toBe('/rewrite-target')
      expect(commit.event.to.routes).toEqual([
        { template: '/rewrite-target', params: [] },
      ])
      expect(commit.event.to.searchParams).toEqual({
        q: 'from-user',
        internal: 'from-middleware',
      })

      // Navigating away reports the same post-rewrite route as `from`, so the
      // next transition's start joins up with this one's commit.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      const start = (await getTransitionEvents(browser))
        .filter((e) => e.phase === 'start')
        .at(-1)
      expect(start.event.from.canonicalUrl).toBe('/rewrite-source?q=from-user')
      expect(start.event.from.renderedPathname).toBe('/rewrite-target')
      expect(start.event.from.searchParams).toEqual({
        q: 'from-user',
        internal: 'from-middleware',
      })
    })

    it('keeps route param names out of events but reports search params verbatim', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/blog/hello?tag=react"]').click()
      await browser.elementById('blog-post')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      // Log continuity: the dynamic segment is a positional hole. The param
      // name (`slug`) is an app-internal identifier — renaming the `[slug]`
      // folder must not change what consumers group logs by — so it appears
      // nowhere in the event, neither as a template segment nor as a key.
      expect(commit.event.to.routes).toEqual([
        { template: '/blog/:1', params: ['hello'] },
      ])
      expect(JSON.stringify(commit.event)).not.toContain('slug')
      // Search params are the exception: their names are already user-facing
      // (they appear in the address bar itself), so they are kept verbatim.
      expect(commit.event.to.searchParams).toEqual({ tag: 'react' })
      expect(commit.event.to.canonicalUrl).toBe('/blog/hello?tag=react')
      expect(commit.event.to.renderedPathname).toBe('/blog/hello')
    })

    it('omits route groups from route templates', async () => {
      const browser = await next.browser('/about')

      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')

      const start = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'start'
      )
      // The (marketing) group folder is not part of the route template.
      expect(start.event.from.routes).toEqual([
        { template: '/about', params: [] },
      ])
    })

    it('includes parallel slots and reports the post-rewrite pathname for intercepted routes', async () => {
      const browser = await next.browser('/gallery')

      await browser.elementByCss('a[href="/gallery/photos/1"]').click()
      await browser.elementById('photo-modal')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      // The intercepted modal keeps the gallery as the rendered (primary) route
      // even though the browser URL is /gallery/photos/1. Params are scoped
      // per template: the modal's own `:1` hole carries the photo id, while
      // the primary gallery route has no holes — so the id is reported (and
      // joinable) even though it belongs to a parallel slot, and there is no
      // ambiguity about which template a param fills.
      expect(commit.event.to.renderedPathname).toBe('/gallery')
      expect(commit.event.to.routes).toEqual([
        { template: '/gallery', params: [] },
        { template: '/gallery/@modal/(.)photos/:1', params: ['1'] },
      ])
    })

    it('runs commit exactly once per navigation', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })
      const events = await getTransitionEvents(browser)
      expect(events.filter((e) => e.phase === 'start')).toHaveLength(1)
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('commits only the newest of three rapid pushes and aborts the older two', async () => {
      const browser = await next.browser('/')

      // Three navigations dispatched in a single click handler. Only the
      // newest may commit; both older ones must abort, attributed to the
      // newest transition's commit.
      await browser.elementById('triple-push').click()
      await browser.elementById('dashboard')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(2)
      })

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      const aborts = events.filter((e) => e.phase === 'abort')
      expect(starts.map((e) => e.url)).toEqual([
        '/some-page',
        '/blog/hello',
        '/dashboard',
      ])
      // The commit belongs to the newest transition...
      expect(commit.url).toBe('/dashboard')
      expect(commit.event.id).toBe(starts[2].event.id)
      // ...and the two older transitions abort in start order, each replaced
      // by the newest transition's commit.
      expect(aborts.map((e) => e.url)).toEqual(['/some-page', '/blog/hello'])
      expect(aborts.map((e) => e.event.id)).toEqual([
        starts[0].event.id,
        starts[1].event.id,
      ])
      for (const abort of aborts) {
        expect(abort.event.replacedBy).toBe(commit.event.id)
        expect(Object.keys(abort.event).sort()).toEqual([
          'id',
          'replacedBy',
          'timestamp',
        ])
      }
      // Ordering: all starts precede the terminal events, and the commit is
      // reported before the aborts it caused.
      expect(events.map((e) => e.phase)).toEqual([
        'start',
        'start',
        'start',
        'commit',
        'abort',
        'abort',
      ])

      // The counts are terminal: a follow-up navigation adds exactly one
      // start/commit pair and nothing else — no duplicate or late terminal
      // events for the already-settled transitions.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      await retry(async () => {
        const after = await getTransitionEvents(browser)
        expect(after.filter((e) => e.phase === 'commit')).toHaveLength(2)
      })
      const after = await getTransitionEvents(browser)
      expect(after.filter((e) => e.phase === 'start')).toHaveLength(4)
      expect(after.filter((e) => e.phase === 'abort')).toHaveLength(2)
    })

    it('aborts the two older transitions when the same slow link is clicked three times', async () => {
      // Warm the route first so dev on-demand compilation doesn't stack on
      // top of the middleware delay during the race below.
      await next.fetch('/slow')
      const browser = await next.browser('/')

      // Unlike the same-tick triple-push above, these are three real clicks in
      // separate event-loop turns, each landing while the previous click's
      // dynamic fetch (delayed 2s by middleware) is still in flight. Each
      // dispatch discards the pending navigate action, so only the last click
      // can ever produce a committable state.
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('#slow-page', { timeout: 10000 })

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(2)
      }, 5000)

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      const aborts = events.filter((e) => e.phase === 'abort')
      // Three distinct transitions, all targeting the same URL.
      expect(starts.map((e) => e.url)).toEqual(['/slow', '/slow', '/slow'])
      expect(new Set(starts.map((e) => e.event.id)).size).toBe(3)
      // The last click commits; the two older clicks abort in start order,
      // each attributed to the commit that replaced them.
      expect(commit.event.id).toBe(starts[2].event.id)
      expect(commit.event.to.renderedPathname).toBe('/slow')
      expect(aborts.map((e) => e.event.id)).toEqual([
        starts[0].event.id,
        starts[1].event.id,
      ])
      for (const abort of aborts) {
        expect(abort.event.replacedBy).toBe(commit.event.id)
      }
      expect(events.map((e) => e.phase)).toEqual([
        'start',
        'start',
        'start',
        'commit',
        'abort',
        'abort',
      ])
    })

    it('reports a full lifecycle for a link click to the current page', async () => {
      const browser = await next.browser('/some-page')

      // A push to the page we are already on is still a navigation (it adds a
      // history entry), so it reports a normal start/commit pair — the origin
      // and destination routes are just identical.
      await browser.elementByCss('a[href="/some-page"]').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(start.url).toBe('/some-page')
      expect(start.navigateType).toBe('push')
      expect(commit.event.id).toBe(start.event.id)
      expect(commit.event.to.routes).toEqual(start.event.from.routes)
      expect(commit.event.to.routes).toEqual([
        { template: '/some-page', params: [] },
      ])
      expect(commit.event.to.renderedPathname).toBe('/some-page')
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('reports a full lifecycle for a query-param-only navigation', async () => {
      const browser = await next.browser('/some-page')

      await browser.elementByCss('a[href="/some-page?tab=stats"]').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(commit.event.id).toBe(start.event.id)
      // The route identity is unchanged — only the search params moved.
      expect(start.event.from.searchParams).toEqual({})
      expect(commit.event.to.searchParams).toEqual({ tab: 'stats' })
      expect(commit.event.to.routes).toEqual(start.event.from.routes)
      expect(commit.event.to.renderedPathname).toBe('/some-page')
      expect(commit.event.to.canonicalUrl).toBe('/some-page?tab=stats')
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('does not emit lifecycle events for a shallow history.pushState', async () => {
      const browser = await next.browser('/')

      // A direct History API call is not a router navigation: the router only
      // re-synchronizes its state (via a restore action that is not a tracked
      // transition), so no lifecycle events may fire.
      await browser.eval(`window.history.pushState(null, '', '/?shallow=1')`)

      // A follow-up real navigation serializes through the action queue behind
      // the shallow restore, so once it settles we know the restore produced
      // no events and left nothing pending to be misreported.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      expect(events.map((e) => e.phase)).toEqual(['start', 'commit'])
      expect(events[0].url).toBe('/some-page')
      // The shallow update is still reflected in router state: the next
      // transition's `from` describes the shallow-updated URL.
      expect(events[0].event.from.canonicalUrl).toBe('/?shallow=1')
      expect(events[0].event.from.routes).toEqual([
        { template: '/', params: [] },
      ])
    })

    it('does not let a refresh() racing an in-flight navigation emit or steal lifecycle events', async () => {
      const browser = await next.browser('/')

      // The click handler dispatches a navigation and a refresh in the same
      // tick. The refresh derives a fresh tree from the navigation's
      // not-yet-committed state, and React batches the two updates, so only
      // the refresh's tree ever reaches HistoryUpdater. Settling the refresh
      // action re-points the pending transition at the derived tree (see the
      // destination-preserving arm of settleRouterTransition), so the
      // navigation still reports its commit — the refresh itself must not
      // emit any events of its own.
      await browser.elementById('push-then-refresh').click()
      await browser.elementById('no-prefetch')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      // The page rendered fresh server content. (Only the batch's final state
      // mounts, so at least one render stamp is observable — the navigation's
      // own intermediate state may legitimately never render.)
      await retry(async () => {
        const stamps = await browser.eval(
          `Array.from(new Set(window.__NO_PREFETCH_RENDER_STAMPS || []))`
        )
        expect(stamps.length).toBeGreaterThanOrEqual(1)
      })

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      const commits = events.filter((e) => e.phase === 'commit')
      expect(starts).toHaveLength(1)
      expect(starts[0].url).toBe('/no-prefetch')
      expect(commits).toHaveLength(1)
      expect(commits[0].event.id).toBe(starts[0].event.id)
      expect(commits[0].event.to.renderedPathname).toBe('/no-prefetch')
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)

      // The transition is settled, not starved: before the fix, its entry
      // lingered in the pending buffer and the NEXT navigation's commit
      // falsely reported it as aborted/replaced. A follow-up navigation
      // must add exactly one start/commit pair and no aborts.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      await retry(async () => {
        const after = await getTransitionEvents(browser)
        expect(after.filter((e) => e.phase === 'commit')).toHaveLength(2)
      })
      const after = await getTransitionEvents(browser)
      expect(after.filter((e) => e.phase === 'start')).toHaveLength(2)
      expect(after.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('keeps exactly-once terminal accounting when a push races history.back()', async () => {
      const browser = await next.browser('/')

      // Build a history entry to traverse back to, and let its transition
      // settle before clearing the log.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })
      await browser.eval(`window.__ROUTER_TRANSITION_EVENTS.length = 0`)

      // The race: a push is dispatched and immediately raced by a history
      // traversal (popstate arrives asynchronously). Depending on timing
      // either both transitions commit, or the traversal replaces the push —
      // but every start must get exactly one terminal event either way.
      await browser.elementById('push-then-back').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        const starts = events.filter((e) => e.phase === 'start')
        expect(starts).toHaveLength(2)
        for (const start of starts) {
          const terminals = events.filter(
            (e) =>
              (e.phase === 'commit' || e.phase === 'abort') &&
              e.event.id === start.event.id
          )
          expect(terminals).toHaveLength(1)
        }
      })

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      expect(starts[0].navigateType).toBe('push')
      expect(starts[0].url).toBe('/blog/hello')
      expect(starts[1].navigateType).toBe('traverse')
      // Where the traversal lands depends on whether the push's history entry
      // was applied before the browser processed back().
      expect(['/', '/some-page']).toContain(starts[1].url)

      const commits = events.filter((e) => e.phase === 'commit')
      const aborts = events.filter((e) => e.phase === 'abort')
      // Exactly one terminal event per start; no id may both commit and abort.
      expect(commits.length + aborts.length).toBe(2)
      // Only the push may abort, and only attributed to a commit that
      // actually happened.
      for (const abort of aborts) {
        expect(abort.event.id).toBe(starts[0].event.id)
        expect(commits.map((c) => c.event.id)).toContain(abort.event.replacedBy)
      }
    })

    it('tracks two same-tick pushes to the current URL as distinct transitions', async () => {
      const browser = await next.browser('/')

      // Both pushes target the URL we are already on, so both destination
      // states describe the same route. They must still be tracked as two
      // distinct transitions: the newer one commits, the older one aborts.
      await browser.elementById('double-same-page-push').click()

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      expect(starts).toHaveLength(2)
      expect(starts[0].event.id).not.toBe(starts[1].event.id)
      const commit = events.find((e) => e.phase === 'commit')
      const abort = events.find((e) => e.phase === 'abort')
      expect(commit.event.id).toBe(starts[1].event.id)
      expect(abort.event.id).toBe(starts[0].event.id)
      expect(abort.event.replacedBy).toBe(commit.event.id)
      // Same-page navigation: the committed route is identical to the origin.
      expect(commit.event.to.routes).toEqual([{ template: '/', params: [] }])
      expect(commit.event.to.renderedPathname).toBe('/')
    })

    it('reports a replace navigation with a full lifecycle and a stable commit payload shape', async () => {
      const browser = await next.browser('/')

      await browser.elementById('replace-some-page').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(start.navigateType).toBe('replace')
      expect(commit.navigateType).toBe('replace')
      expect(commit.url).toBe('/some-page')
      expect(commit.event.id).toBe(start.event.id)
      expect(commit.event.to.routes).toEqual([
        { template: '/some-page', params: [] },
      ])
      // The commit event carries exactly id/timestamp/to.
      expect(Object.keys(commit.event).sort()).toEqual([
        'id',
        'timestamp',
        'to',
      ])
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('reports catch-all params positionally as a string array', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-catch-all').click()
      await browser.elementById('docs-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const commit = (await getTransitionEvents(browser)).find(
        (e) => e.phase === 'commit'
      )
      // The catch-all is a single positional hole whose value is the array of
      // path segments.
      expect(commit.event.to.routes).toEqual([
        { template: '/docs/:1', params: [['a', 'b']] },
      ])
      expect(commit.event.to.renderedPathname).toBe('/docs/a/b')
      expect(commit.event.to.canonicalUrl).toBe('/docs/a/b?x=1&x=2')
      // Repeated search params are reported as an array, verbatim.
      expect(commit.event.to.searchParams).toEqual({ x: ['1', '2'] })
    })

    // SKIPPED — documents a lifecycle gap rather than the expected behavior:
    // a client-side navigation to an unmatched route bails out of the SPA
    // navigation (updateCacheNodeOnNavigation returns null when the new
    // segment is NOT_FOUND_SEGMENT_KEY) and performs an MPA full-page
    // navigation instead. The `start` event fires, then the page unloads —
    // no commit or abort ever follows. (The transition is untracked at the
    // MPA fallback, so it at least can't resurface later as a bogus
    // "replaced" abort; emitting a real terminal event for MPA/failed
    // navigations is a TODO in untrackRouterTransition.) Verified
    // empirically: after `router.push('/no-such-route')` the window state
    // (including the event log) is reset by a full reload.
    it.skip('completes the lifecycle for a navigation to the not-found route', async () => {
      const browser = await next.browser('/')

      await browser.elementById('push-missing').click()
      await browser.elementById('not-found-page')

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })

      const events = await getTransitionEvents(browser)
      const start = events.find((e) => e.phase === 'start')
      const commit = events.find((e) => e.phase === 'commit')
      expect(start.url).toBe('/no-such-route')
      expect(commit.event.id).toBe(start.event.id)
      expect(
        commit.event.to.routes.some((route) =>
          route.template.includes('_not-found')
        )
      ).toBe(true)
      expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
    })

    it('still delivers aborts and later lifecycles when a commit hook throws', async () => {
      const browser = await next.browser('/')
      await browser.eval(`window.__THROW_ON_COMMIT = true`)

      await browser.elementById('triple-push').click()
      await browser.elementById('dashboard')

      // The commit hook threw, but the aborts for the two replaced
      // transitions must still be delivered (error isolation).
      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(2)
      })
      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      expect(starts).toHaveLength(3)
      // The commit was not recorded (the hook threw before recording)...
      expect(events.filter((e) => e.phase === 'commit')).toHaveLength(0)
      // ...but the aborts still name the committing transition.
      for (const abort of events.filter((e) => e.phase === 'abort')) {
        expect(abort.event.replacedBy).toBe(starts[2].event.id)
      }
      expect(
        (await browser.log()).filter((log) =>
          log.message.includes(
            'An instrumentation-client router transition hook failed'
          )
        )
      ).toHaveLength(1)

      // The failure is isolated to that one commit: with the hook behaving
      // again, the next navigation reports a normal lifecycle.
      await browser.eval(`window.__THROW_ON_COMMIT = false`)
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      await retry(async () => {
        const after = await getTransitionEvents(browser)
        expect(after.filter((e) => e.phase === 'commit')).toHaveLength(1)
      })
      const after = await getTransitionEvents(browser)
      const lastStart = after.filter((e) => e.phase === 'start').at(-1)
      const commit = after.find((e) => e.phase === 'commit')
      expect(commit.event.id).toBe(lastStart.event.id)
      expect(after.filter((e) => e.phase === 'abort')).toHaveLength(2)
    })
  })

  describe.each([
    {
      name: 'default',
      packageJson: {},
    },
    {
      name: 'with type:module',
      packageJson: { type: 'module' },
    },
  ])('instrumentationClientInject $name', ({ packageJson }) => {
    const { next } = nextTestSetup({
      files: path.join(__dirname, 'inject'),
      packageJson,
    })

    it('runs each injected module before the user instrumentation-client and before hydration, in array order', async () => {
      const browser = await next.browser('/')

      const order = await browser.eval(`window.__INJECT_ORDER`)
      expect(order).toEqual(['side-effect', 'late-hook', 'a', 'b', 'user'])

      const moduleA = await browser.eval(`window.__INJECT_A_EXECUTED_AT`)
      const moduleB = await browser.eval(`window.__INJECT_B_EXECUTED_AT`)
      const userTime = await browser.eval(
        `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
      )
      const hydrationTime = await browser.eval(`window.__NEXT_HYDRATED_AT`)

      expect(moduleA).toBeDefined()
      expect(moduleB).toBeDefined()
      expect(userTime).toBeDefined()
      expect(hydrationTime).toBeDefined()

      expect(moduleA).toBeLessThanOrEqual(moduleB)
      expect(moduleB).toBeLessThanOrEqual(userTime)
      expect(userTime).toBeLessThan(hydrationTime)
    })

    it('surfaces onRouterTransitionStart from every injected module', async () => {
      const browser = await next.browser('/')
      await browser.eval(`window.__INSTALL_LATE_INSTRUMENTATION_HOOK()`)

      const linkToSomePage = await browser.elementByCss('a[href="/some-page"]')
      await linkToSomePage.click()
      await browser.elementById('some-page')

      const linkToHome = await browser.elementByCss('a[href="/"]')
      await linkToHome.click()
      await browser.elementById('home')

      expect(filterNavigationStartLogs(await browser.log())).toEqual([
        '[Router Transition Start] [push] /some-page late-hook',
        '[Router Transition Start] [push] /some-page a',
        '[Router Transition Start] [push] /some-page b',
        '[Router Transition Start] [push] /some-page user',
        '[Router Transition Start] [push] / late-hook',
        '[Router Transition Start] [push] / a',
        '[Router Transition Start] [push] / b',
        '[Router Transition Start] [push] / user',
      ])
    })

    it('isolates hook errors between injected modules', async () => {
      const browser = await next.browser('/')

      await browser.eval(`window.__INSTALL_LATE_INSTRUMENTATION_HOOK()`)
      await browser.eval(`window.__THROW_INJECT_A = true`)
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      const logs = await browser.log()
      expect(filterNavigationStartLogs(logs)).toEqual([
        '[Router Transition Start] [push] /some-page late-hook',
        '[Router Transition Start] [push] /some-page a',
        '[Router Transition Start] [push] /some-page b',
        '[Router Transition Start] [push] /some-page user',
      ])
      expect(
        logs.filter((log) =>
          log.message.includes(
            'An instrumentation-client router transition hook failed'
          )
        )
      ).toHaveLength(1)
    })
  })

  if (isNextDev) {
    describe('HMR in development mode', () => {
      const { next } = nextTestSetup({
        files: path.join(__dirname, 'app-router'),
      })

      it('should reload instrumentation-client when modified', async () => {
        const browser = await next.browser('/')
        const initialTime = await browser.eval(
          `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
        )
        expect(initialTime).toBeDefined()

        // Modify the instrumentation-client.ts file
        const instrumentationPath = 'instrumentation-client.ts'

        const originalContent = await next.readFile(instrumentationPath)

        await next.patchFile(
          instrumentationPath,
          `
          window.__INSTRUMENTATION_CLIENT_EXECUTED_AT = Date.now();
          window.__INSTRUMENTATION_CLIENT_UPDATED = true;
          `
        )

        await retry(async () => {
          // Check if the updated instrumentation client was executed
          const updatedFlag = await browser.eval(
            `window.__INSTRUMENTATION_CLIENT_UPDATED`
          )
          expect(updatedFlag).toBe(true)

          // Verify new execution time
          const newTime = await browser.eval(
            `window.__INSTRUMENTATION_CLIENT_EXECUTED_AT`
          )
          expect(newTime).toBeDefined()
          expect(newTime).toBeGreaterThan(initialTime)
        })

        // Restore the original file
        await next.patchFile(instrumentationPath, originalContent)
      })
    })
  }
})
