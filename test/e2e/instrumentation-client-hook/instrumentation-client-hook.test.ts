import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

// Several routes in the app-router fixture read dynamic request data
// (searchParams, or connection() in /slow) with no Suspense boundary above it,
// so the transition events can report per-URL search and so a navigation to
// /slow blocks. Cache components fails the build for dynamic access outside
// Suspense unless the route opts into blocking with `export const instant =
// false` — but that config is itself a build error when cacheComponents is NOT
// enabled, so it can't live in the shared fixture.
// When cache components is on we overlay a copy of each page with the export
// prepended, via `overrideFiles`: it is written during setup, before the build
// runs in every mode — including deploy, where the build runs inside setup() so
// a test-body patchFile would be too late. Evaluated here at collection time,
// where the env var is already set.
const appRouterDir = path.join(__dirname, 'app-router')
const cacheComponentsOverrideFiles =
  process.env.__NEXT_CACHE_COMPONENTS === 'true'
    ? Object.fromEntries(
        [
          'app/slow/page.tsx',
          'app/query/page.tsx',
          'app/rewrite-target/page.tsx',
          'app/blog/[slug]/page.tsx',
          'app/docs/[...parts]/page.tsx',
        ].map((relPath) => [
          relPath,
          `export const instant = false\n${fs.readFileSync(
            path.join(appRouterDir, relPath),
            'utf8'
          )}`,
        ])
      )
    : undefined

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
        overrideFiles:
          appDir === 'app-router' ? cacheComponentsOverrideFiles : undefined,
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
      overrideFiles: cacheComponentsOverrideFiles,
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
      overrideFiles: cacheComponentsOverrideFiles,
    })

    async function getTransitionEvents(browser) {
      return browser.eval(`window.__ROUTER_TRANSITION_EVENTS`)
    }

    // Waits until exactly `count` commits have been reported and returns the
    // event log snapshot that satisfied the wait — assert on that snapshot,
    // not on a re-fetch that may already contain newer events.
    async function waitForCommitCount(browser, count: number) {
      return retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(count)
        return events
      })
    }

    // The newest commit event. A bare .at(-1) on the log could bind an abort
    // (aborts are reported after the commit that replaced them) whose payload
    // has no `to`, turning an assertion diff into an opaque TypeError.
    function lastCommit(events) {
      return events.filter((e) => e.phase === 'commit').at(-1)
    }

    it('reports one exact start/commit pair per push, replace, and traverse, and ignores shallow pushState', async () => {
      const browser = await next.browser('/')

      // Push: the pair carries exactly the public payload shape, correlated
      // by id.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      {
        const [start, commit] = await waitForCommitCount(browser, 1)
        expect(start.phase).toBe('start')
        expect(start.url).toBe('/some-page')
        expect(start.navigateType).toBe('push')
        expect(typeof start.event.id).toBe('string')
        expect(start.event.timestamp).toBeGreaterThan(0)
        // The `from` route describes the page we navigated away from (the
        // home page).
        expect(start.event.from.routes).toEqual([{ template: '/', params: {} }])
        expect(start.event.from.renderedPathname).toBe('/')
        expect(start.event.from.searchParams).toEqual({})
        // The events carry exactly the public fields — in particular no
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
        expect(commit.phase).toBe('commit')
        expect(commit.navigateType).toBe('push')
        expect(commit.event.id).toBe(start.event.id)
        expect(commit.event.timestamp).toBeGreaterThanOrEqual(
          start.event.timestamp
        )
        expect(Object.keys(commit.event).sort()).toEqual([
          'cacheHit',
          'id',
          'timestamp',
          'to',
        ])
        // The value is asserted in the dedicated cacheHit tests below: this
        // first click races the link's own prefetch (clicking before it
        // lands is a genuine cache miss), so only the payload shape is
        // deterministic here.
        expect(typeof commit.event.cacheHit).toBe('boolean')
        expect(commit.event.to.routes).toEqual([
          { template: '/some-page', params: {} },
        ])
        expect(commit.event.to.renderedPathname).toBe('/some-page')
      }

      // Replace: the same lifecycle with the navigateType plumbed through.
      await browser.elementById('replace-some-page').click()
      {
        const [start, commit] = (await waitForCommitCount(browser, 2)).slice(2)
        expect(start.navigateType).toBe('replace')
        expect(commit.navigateType).toBe('replace')
        expect(commit.event.id).toBe(start.event.id)
      }

      // Traverse: back() reports its own tracked pair.
      await browser.back()
      await browser.elementById('home')
      {
        const [start, commit] = (await waitForCommitCount(browser, 3)).slice(4)
        expect(start.navigateType).toBe('traverse')
        expect(commit.navigateType).toBe('traverse')
        expect(commit.event.id).toBe(start.event.id)
        expect(commit.event.to.routes).toEqual([{ template: '/', params: {} }])
      }

      // A direct History API call is not a router navigation: the router
      // only re-synchronizes its state (an untracked restore), so it emits
      // nothing — but the next transition's `from` reflects the
      // shallow-updated URL.
      await browser.eval(`window.history.pushState(null, '', '/?shallow=1')`)
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      const events = await waitForCommitCount(browser, 4)
      // Exactly one start/commit pair per navigation and nothing else — in
      // particular, the shallow pushState emitted no events at all.
      expect(events.map((e) => e.phase)).toEqual([
        'start',
        'commit',
        'start',
        'commit',
        'start',
        'commit',
        'start',
        'commit',
      ])
      expect(events.at(-2).event.from.canonicalUrl).toBe('/?shallow=1')
    })

    it('reports a cache hit when restoring a cached route', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await browser.back()
      await browser.elementById('home')
      // Going forward restores /some-page from the BFCache, so there is a fully
      // rendered shell to navigate into.
      await browser.forward()
      await browser.elementById('some-page')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser))
          .filter((e) => e.phase === 'commit' && e.url === '/some-page')
          .at(-1)
        expect(commit?.event.cacheHit).toBe(true)
      })
    })

    it('reports a cache hit for a fully prefetched route', async () => {
      const browser = await next.browser('/')

      // The /some-page link uses prefetch={true}, so its complete route —
      // shell and head — is fetched up front. Once that prefetch lands the
      // click navigates straight through the segment walk (not the BFCache
      // path the previous test covers), so the cache serving both the
      // segment bytes AND the head is what makes this a hit: a head the
      // cache could not serve would mark it a miss. In development nothing is
      // prefetched, so the same click first fetches the route — a miss.
      await browser.waitForIdleNetwork()
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.url === '/some-page'
        )
        expect(commit?.event.cacheHit).toBe(isNextDev ? false : true)
      })
    })

    it('reports a cache miss when nothing is prefetched for the route', async () => {
      const browser = await next.browser('/')

      // Without a prefetch the destination state is produced asynchronously
      // (the router blocks on the dynamic fetch), so the cache could not
      // serve the navigation.
      await browser.elementById('push-no-prefetch').click()
      await browser.elementById('no-prefetch')

      await retry(async () => {
        const commit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.url === '/no-prefetch'
        )
        expect(commit?.event.to.renderedPathname).toBe('/no-prefetch')
        expect(commit?.event.cacheHit).toBe(false)
      })
    })

    it('reports a cache hit for a hash-only navigation', async () => {
      const browser = await next.browser('/')

      // A hash-only push still resolves its destination through the route
      // cache, so it is only a hit once the current route's prefetch has
      // landed. Wait for that before clicking; otherwise the click races the
      // prefetch — invisible on a fast machine, but a deterministic miss in
      // slow deploy-mode CI.
      await browser.waitForIdleNetwork()

      await browser.elementById('push-hash').click()
      await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.some((e) => e.phase === 'commit')).toBe(true)
      })
      const commit = lastCommit(await getTransitionEvents(browser))
      // In production the route tree is known locally and the page UI is
      // reused, so the cache serves the navigation — a hit. In development
      // nothing is prefetched, so even a hash-only navigation consults the
      // server for the route tree before committing — an accurate miss.
      expect(commit.event.cacheHit).toBe(isNextDev ? false : true)

      // Traversing back across the hash boundary reuses the tree the same
      // way — a hit in both modes (no fetch ever happens).
      await browser.back()
      await retry(async () => {
        const traverseCommit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.navigateType === 'traverse'
        )
        expect(traverseCommit?.event.cacheHit).toBe(true)
      })
    })

    it('reports end when the destination’s end marker reveals with streamed content, after commit', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/streaming"]').click()
      // The navigation commits with the Suspense fallback; the marker is
      // inside the boundary, so `end` must not exist yet when the streamed
      // content is still pending. Wait for the reveal, then for the event.
      await browser.elementById('streaming-content')
      const events = await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(1)
        return snapshot
      })

      const start = events.find((e) => e.phase === 'start')
      const commit = lastCommit(events)
      const end = events.find((e) => e.phase === 'end')
      expect(end.url).toBe('/streaming')
      expect(end.navigateType).toBe('push')
      // `end` correlates to the same transition as its start/commit, is
      // reported after `commit`, and carries exactly the public fields.
      expect(end.event.id).toBe(start.event.id)
      expect(end.event.id).toBe(commit.event.id)
      expect(events.indexOf(end)).toBeGreaterThan(events.indexOf(commit))
      expect(Object.keys(end.event).sort()).toEqual(['id', 'timestamp'])
      // The reveal waited on the server's 1s delay, so the end-commit gap
      // measures streaming cost: clearly after the commit, not the same
      // instant. (Asserted loosely to keep slow CI off the flake list.)
      expect(end.event.timestamp - commit.event.timestamp).toBeGreaterThan(100)
    })

    it('reports end in the same commit when the marker is part of the committed content', async () => {
      const browser = await next.browser('/')

      // The marker is in the page's own content and the link is prefetched,
      // so the navigation commits with the marker already on screen: `end`
      // reports immediately after `commit`, not in a later reveal.
      await browser.waitForIdleNetwork()
      await browser.elementByCss('a[href="/end-marker"]').click()
      await browser.elementById('end-marker-page')
      const events = await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(1)
        return snapshot
      })

      const commit = lastCommit(events)
      const end = events.find((e) => e.phase === 'end')
      expect(end.event.id).toBe(commit.event.id)
      expect(events.indexOf(end)).toBeGreaterThan(events.indexOf(commit))
      expect(end.event.timestamp).toBeGreaterThanOrEqual(commit.event.timestamp)
    })

    it('reports no end for a route that renders no marker', async () => {
      const browser = await next.browser('/')

      // Navigate to an unmarked route, then to a marked one. The marked
      // navigation’s `end` is the fence that bounds the wait: once it
      // arrives, the unmarked navigation can no longer produce one.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await waitForCommitCount(browser, 1)

      await browser.elementByCss('a[href="/end-marker"]').click()
      await browser.elementById('end-marker-page')
      const events = await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(1)
        return snapshot
      })

      // The only `end` belongs to the marked navigation — the unmarked
      // one ended its lifecycle at `commit`.
      const commits = events.filter((e) => e.phase === 'commit')
      expect(commits).toHaveLength(2)
      const end = events.find((e) => e.phase === 'end')
      expect(end.event.id).toBe(commits[1].event.id)
      expect(end.event.id).not.toBe(commits[0].event.id)
    })

    it('reports end when a traversal re-shows a marked route, and none for an unmarked one', async () => {
      const browser = await next.browser('/')
      await browser.waitForIdleNetwork()

      // Visit the marked page (end #1), then an unmarked page: two pushes.
      await browser.elementByCss('a[href="/end-marker"]').click()
      await browser.elementById('end-marker-page')
      await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(1)
      })
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await waitForCommitCount(browser, 2)

      // Traverse back to the marked page. Under cacheComponents the page was
      // preserved in a hidden <Activity> boundary, so nothing remounts — the
      // reveal itself must report the traversal's `end`. (Element waits can't
      // fence this step: the hidden page's DOM is still attached, so the
      // marker element is findable before the traversal commits.)
      await browser.back()
      const events = await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(2)
        return snapshot
      })

      const traverseCommit = lastCommit(events)
      expect(traverseCommit.navigateType).toBe('traverse')
      expect(traverseCommit.event.to.canonicalUrl).toBe('/end-marker')
      const ends = events.filter((e) => e.phase === 'end')
      // The traversal's own `end`, after its `commit` — not a late report
      // against the push that first mounted the marker, and nothing for the
      // unmarked page's push.
      expect(ends[1].event.id).toBe(traverseCommit.event.id)
      expect(events.indexOf(ends[1])).toBeGreaterThan(
        events.indexOf(traverseCommit)
      )
      expect(ends[1].event.timestamp).toBeGreaterThanOrEqual(
        traverseCommit.event.timestamp
      )
      const somePageCommit = events.filter((e) => e.phase === 'commit')[1]
      expect(ends.some((e) => e.event.id === somePageCommit.event.id)).toBe(
        false
      )
    })

    it('reports no end for a hash-only navigation on a marked page: nothing newly shows', async () => {
      const browser = await next.browser('/')
      await browser.waitForIdleNetwork()

      // Land on the marked page (end #1).
      await browser.elementByCss('a[href="/end-marker"]').click()
      await browser.elementById('end-marker-page')
      await retry(async () => {
        expect(
          (await getTransitionEvents(browser)).filter((e) => e.phase === 'end')
        ).toHaveLength(1)
      })

      // A hash-only push on the marked page: the committed tree is the tree
      // already on screen, so its marker never leaves the screen and nothing
      // newly shows — the navigation commits but no marker declares a load.
      await browser.elementById('push-end-marker-hash').click()
      await waitForCommitCount(browser, 2)

      // Fence: leave and re-enter the marked page. Its `end` bounds the
      // negative wait — once it arrives, the hash navigation (which committed
      // two navigations earlier) can no longer produce one.
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await waitForCommitCount(browser, 3)
      await browser.elementByCss('a[href="/end-marker"]').click()
      const events = await retry(async () => {
        const snapshot = await getTransitionEvents(browser)
        expect(snapshot.filter((e) => e.phase === 'end')).toHaveLength(2)
        return snapshot
      })

      const commits = events.filter((e) => e.phase === 'commit')
      expect(commits).toHaveLength(4)
      const hashCommit = commits[1]
      expect(hashCommit.event.to.canonicalUrl).toBe('/end-marker#section')
      // Both ends belong to the full navigations onto the marked page —
      // neither to the hash-only one.
      const ends = events.filter((e) => e.phase === 'end')
      expect(ends.map((e) => e.event.id)).toEqual([
        commits[0].event.id,
        commits[3].event.id,
      ])
    })

    it('reports the canonical relative URL on every navigation type, including traversals', async () => {
      const browser = await next.browser('/')

      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await waitForCommitCount(browser, 1)
      await browser.back()
      const events = await waitForCommitCount(browser, 2)

      // The hooks' `url` argument is the canonical relative href for pushes
      // and traversals alike: a traversal must not leak the absolute
      // `location.href` the popstate handler works with.
      const push = events.find((e) => e.phase === 'start')
      expect(push.navigateType).toBe('push')
      expect(push.rawUrl).toBe('/some-page')
      const traverseEvents = events.filter((e) => e.navigateType === 'traverse')
      expect(traverseEvents.length).toBeGreaterThanOrEqual(2)
      for (const event of traverseEvents) {
        expect(event.rawUrl).toBe('/')
      }
    })

    it('describes routes across group, dynamic, catch-all, rewritten, hash, query, and intercepted URLs', async () => {
      // One journey through every route-description shape the describe logic
      // handles; each leg waits for its commit and asserts on the newest
      // events.
      const browser = await next.browser('/about')

      // Route groups: the (marketing) folder is not part of the template.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      const [groupStart] = await waitForCommitCount(browser, 1)
      expect(groupStart.event.from.routes).toEqual([
        { template: '/about', params: {} },
      ])

      // Dynamic segment: the template reports the param name verbatim in its
      // source notation, with the value keyed by that name.
      await browser.elementByCss('a[href="/blog/hello?tag=react"]').click()
      await browser.elementById('blog-post')
      const blogCommit = lastCommit(await waitForCommitCount(browser, 2))
      expect(blogCommit.event.to.routes).toEqual([
        { template: '/blog/[slug]', params: { slug: 'hello' } },
      ])
      expect(blogCommit.event.to.searchParams).toEqual({ tag: 'react' })
      expect(blogCommit.event.to.canonicalUrl).toBe('/blog/hello?tag=react')
      expect(blogCommit.event.to.renderedPathname).toBe('/blog/hello')

      // Catch-all: the param value is the array of matched path segments;
      // repeated search params are reported as an array, verbatim.
      await browser.elementById('push-catch-all').click()
      await browser.elementById('docs-page')
      const docsCommit = lastCommit(await waitForCommitCount(browser, 3))
      expect(docsCommit.event.to.routes).toEqual([
        { template: '/docs/[...parts]', params: { parts: ['a', 'b'] } },
      ])
      expect(docsCommit.event.to.renderedPathname).toBe('/docs/a/b')
      expect(docsCommit.event.to.canonicalUrl).toBe('/docs/a/b?x=1&x=2')
      expect(docsCommit.event.to.searchParams).toEqual({ x: ['1', '2'] })

      // Middleware rewrite: the address bar keeps the URL the user navigated
      // to, while the rendered pathname, templates, and search params are
      // post-rewrite — they describe what the server actually rendered,
      // including the search param the middleware added.
      await browser
        .elementByCss('a[href="/rewrite-source?q=from-user"]')
        .click()
      await browser.elementById('rewrite-target')
      const rewriteCommit = lastCommit(await waitForCommitCount(browser, 4))
      expect(rewriteCommit.event.to.canonicalUrl).toBe(
        '/rewrite-source?q=from-user'
      )
      expect(rewriteCommit.event.to.renderedPathname).toBe('/rewrite-target')
      expect(rewriteCommit.event.to.routes).toEqual([
        { template: '/rewrite-target', params: {} },
      ])
      expect(rewriteCommit.event.to.searchParams).toEqual({
        q: 'from-user',
        internal: 'from-middleware',
      })

      // ...and navigating away reports the same post-rewrite route as
      // `from`, so the next transition's start joins up with that commit.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      const homeStart = (await waitForCommitCount(browser, 5))
        .filter((e) => e.phase === 'start')
        .at(-1)
      expect(homeStart.event.from.canonicalUrl).toBe(
        '/rewrite-source?q=from-user'
      )
      expect(homeStart.event.from.renderedPathname).toBe('/rewrite-target')
      expect(homeStart.event.from.searchParams).toEqual({
        q: 'from-user',
        internal: 'from-middleware',
      })

      // Hash-only: the route identity is unchanged — only the hash-bearing
      // canonicalUrl moves — and a traverse back across the hash boundary
      // reuses the same unchanged route.
      await browser.elementById('push-hash').click()
      const hashCommit = lastCommit(await waitForCommitCount(browser, 6))
      expect(hashCommit.event.to.canonicalUrl).toBe('/#section')
      expect(hashCommit.event.to.routes).toEqual([
        { template: '/', params: {} },
      ])
      expect(hashCommit.event.to.renderedPathname).toBe('/')
      await browser.back()
      await retry(async () => {
        const traverseCommit = (await getTransitionEvents(browser)).find(
          (e) => e.phase === 'commit' && e.navigateType === 'traverse'
        )
        expect(traverseCommit?.event.to.routes).toEqual([
          { template: '/', params: {} },
        ])
      })

      // Query-only: the route identity is unchanged, only search moved. The
      // destination page reads searchParams, so what the server rendered
      // matches the URL in every delivery mode.
      await browser.elementByCss('a[href="/query?tab=stats"]').click()
      // First visit to /query in this session: wait for the page (dev
      // compilation + its blocking dynamic render) before the short
      // commit-count retry window.
      await browser.elementById('query-page')
      const queryEvents = await waitForCommitCount(browser, 8)
      const queryCommit = lastCommit(queryEvents)
      expect(queryCommit.event.to.searchParams).toEqual({ tab: 'stats' })
      expect(queryCommit.event.to.renderedPathname).toBe('/query')
      expect(queryCommit.event.to.canonicalUrl).toBe('/query?tab=stats')
      // Nothing in this journey raced anything: no aborts.
      expect(queryEvents.filter((e) => e.phase === 'abort')).toHaveLength(0)

      // Parallel slots + interception (fresh full-page load, so the modal is
      // reached from the gallery): the intercepted modal keeps the gallery
      // as the rendered primary route, and params are scoped per template —
      // the modal's own `id` param carries the photo id.
      await browser.get(new URL('/gallery', next.url).href)
      // browser.get() does not wait for hydration (next.browser does): a
      // pre-hydration click would fall back to a native full-page navigation
      // and reset the event log.
      await browser.waitForCondition('window.__NEXT_HYDRATED === true')
      await browser.elementByCss('a[href="/gallery/photos/1"]').click()
      await browser.elementById('photo-modal')
      const modalCommit = lastCommit(await waitForCommitCount(browser, 1))
      expect(modalCommit.event.to.renderedPathname).toBe('/gallery')
      expect(modalCommit.event.to.routes).toEqual([
        { template: '/gallery', params: {} },
        { template: '/gallery/@modal/(.)photos/[id]', params: { id: '1' } },
      ])
    })

    it('commits only the newest of three rapid pushes and aborts the older two', async () => {
      const browser = await next.browser('/')

      // Three navigations dispatched in a single click handler. Only the
      // newest may commit; both older ones must abort, attributed to the
      // newest transition's commit.
      await browser.elementById('triple-push').click()
      await browser.elementById('dashboard')

      const events = await retry(async () => {
        const events = await getTransitionEvents(browser)
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(1)
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(2)
        return events
      })
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
      const after = await waitForCommitCount(browser, 2)
      expect(after.filter((e) => e.phase === 'start')).toHaveLength(4)
      expect(after.filter((e) => e.phase === 'abort')).toHaveLength(2)

      // Two same-tick pushes to the URL we are already on (the follow-up
      // landed on `/`) must still be tracked as two distinct transitions
      // with fresh destination trees: the newer one commits, the older one
      // aborts — attributed to it, not to any earlier commit.
      const baseline = after.length
      await browser.elementById('double-same-page-push').click()
      const fresh = await retry(async () => {
        const fresh = (await getTransitionEvents(browser)).slice(baseline)
        expect(fresh.filter((e) => e.phase === 'commit')).toHaveLength(1)
        expect(fresh.filter((e) => e.phase === 'abort')).toHaveLength(1)
        return fresh
      })
      const freshStarts = fresh.filter((e) => e.phase === 'start')
      expect(freshStarts).toHaveLength(2)
      expect(freshStarts[0].event.id).not.toBe(freshStarts[1].event.id)
      const freshCommit = fresh.find((e) => e.phase === 'commit')
      const freshAbort = fresh.find((e) => e.phase === 'abort')
      expect(freshCommit.event.id).toBe(freshStarts[1].event.id)
      expect(freshAbort.event.id).toBe(freshStarts[0].event.id)
      expect(freshAbort.event.replacedBy).toBe(freshCommit.event.id)
      // Same-page navigation: the committed route equals the origin.
      expect(freshCommit.event.to.routes).toEqual([
        { template: '/', params: {} },
      ])
      expect(freshCommit.event.to.renderedPathname).toBe('/')
    })

    it('settles every transition exactly once when the same slow link is clicked three times', async () => {
      // Warm the route first so dev on-demand compilation doesn't stack on
      // top of the page's 2s render delay during the race below.
      await next.fetch('/slow')
      const browser = await next.browser('/')

      // Three real clicks in separate event-loop turns on a link whose page
      // render is slow. The slow page has no Suspense boundary above it, so
      // React keeps the current page and holds each commit until the 2s
      // render resolves — but the RSC response's first rows (the router tree)
      // arrive fast, so each click's navigate action settles in the queue
      // before the next click lands and none of them is discarded. The clicks
      // therefore race at the React level, and which older transitions
      // genuinely commit (as real history entries) before the newest one is a
      // scheduling detail. The lifecycle's guarantee is the accounting: every
      // start gets exactly one terminal event, the newest transition commits,
      // and every abort names a transition that actually committed. (The
      // queue-level replacement race — where older dispatches are discarded
      // and deterministically abort — is covered by the same-tick triple-push
      // above, whose dispatches land before the first action can settle.)
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('a[href="/slow"]').click()
      await browser.elementByCss('#slow-page', { timeout: 10000 })

      await retry(async () => {
        const events = await getTransitionEvents(browser)
        const starts = events.filter((e) => e.phase === 'start')
        expect(starts).toHaveLength(3)
        for (const start of starts) {
          const terminals = events.filter(
            (e) =>
              (e.phase === 'commit' || e.phase === 'abort') &&
              e.event.id === start.event.id
          )
          expect(terminals).toHaveLength(1)
        }
      }, 5000)

      const events = await getTransitionEvents(browser)
      const starts = events.filter((e) => e.phase === 'start')
      const commits = events.filter((e) => e.phase === 'commit')
      const aborts = events.filter((e) => e.phase === 'abort')
      // Three distinct transitions, all targeting the same URL.
      expect(starts.map((e) => e.url)).toEqual(['/slow', '/slow', '/slow'])
      expect(new Set(starts.map((e) => e.event.id)).size).toBe(3)
      // The newest transition always commits — it is the final reducer state,
      // so nothing can replace it — and its commit is the last one reported.
      expect(commits.at(-1).event.id).toBe(starts[2].event.id)
      for (const commit of commits) {
        expect(commit.event.to.renderedPathname).toBe('/slow')
      }
      // An abort must only ever mean "a newer transition committed first":
      // every abort names a commit that actually happened.
      for (const abort of aborts) {
        expect(commits.map((c) => c.event.id)).toContain(abort.event.replacedBy)
      }
      // Commits are reported in start order (an older transition can only
      // commit before the newer one that would otherwise abort it).
      const startOrder = starts.map((e) => e.event.id)
      const commitOrder = commits.map((e) => e.event.id)
      expect(commitOrder).toEqual(
        startOrder.filter((id) => commitOrder.includes(id))
      )
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
      // A miss twice over: the route wasn't prefetched (the push blocked on
      // the dynamic fetch), and the committed tree was derived by the
      // refresh from a second server response (retargetRouterTransition also
      // marks retargeted transitions as misses).
      expect(commits[0].event.cacheHit).toBe(false)
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

    it('reports no terminal events for a same-tick race whose replacer fails', async () => {
      const browser = await next.browser('/')

      // Same tick: the second navigation replaces the first, then itself
      // fails (unparseable flight payload) and falls back to a full-page
      // navigation. The replaced first transition's replacer can never
      // commit, so it is dropped: neither transition may report a commit or
      // an abort — two starts are the only events the consumer ever sees.
      await browser.elementById('push-then-broken-nav').click()
      await browser.elementByCss('#not-found-page')

      // The window event log died with the document. The harness's console
      // capture spans documents (it is only reset by next.browser), and the
      // fixture logs one line per event — so the full-page load must leave
      // exactly the two start lines behind, with no terminal events.
      const transitionLogs = (await browser.log())
        .map((log) => log.message)
        .filter((message) => message.startsWith('[Router Transition'))
      expect(transitionLogs).toEqual([
        '[Router Transition Start] [push] /some-page',
        '[Router Transition Start] [push] /broken-nav',
      ])

      // On the fresh document, a navigation reports a clean lifecycle: the
      // dropped race cannot leak into a later commit's aborts. (The 404 page
      // was reached via a full-page load, so unlike next.browser nothing has
      // waited for hydration yet — a pre-hydration click would navigate
      // natively and reset the event log.)
      await browser.waitForCondition('window.__NEXT_HYDRATED === true')
      await browser.elementByCss('a[href="/dashboard"]').click()
      await browser.elementById('dashboard')
      const events = await waitForCommitCount(browser, 1)
      expect(events.map((e) => e.phase)).toEqual(['start', 'commit'])
      expect(events[0].url).toBe('/dashboard')
    })

    it('keeps navigation attribution exact across same-tick server action revalidation and redirect', async () => {
      const browser = await next.browser('/')

      // Revalidation: router.push() and a revalidating server action
      // dispatched in the same tick. The action is queued behind the
      // navigation and re-derives its not-yet-committed state at the same
      // URL. Whether React commits the navigation's own state or only the
      // action's derived state, the navigation must report exactly one
      // commit, attributed to its own id — the server action emits no events
      // of its own. (/no-prefetch is also the one destination here that is
      // never prefetched: the commit still arrives once the dynamic fetch
      // resolves.)
      await browser.elementById('push-then-revalidate-action').click()
      await browser.elementById('no-prefetch')
      {
        const events = await waitForCommitCount(browser, 1)
        const starts = events.filter((e) => e.phase === 'start')
        const commit = events.find((e) => e.phase === 'commit')
        expect(starts).toHaveLength(1)
        expect(starts[0].url).toBe('/no-prefetch')
        expect(commit.event.id).toBe(starts[0].event.id)
        expect(commit.event.to.renderedPathname).toBe('/no-prefetch')
        expect(events.filter((e) => e.phase === 'abort')).toHaveLength(0)
      }

      // The transition settled exactly once: a follow-up navigation adds one
      // start/commit pair and nothing else.
      await browser.elementByCss('a[href="/"]').click()
      await browser.elementById('home')
      const after = await waitForCommitCount(browser, 2)
      expect(after.filter((e) => e.phase === 'start')).toHaveLength(2)
      expect(after.filter((e) => e.phase === 'abort')).toHaveLength(0)

      // Redirect: router.push('/dashboard') and a server action that
      // redirects to /some-page, dispatched in the same tick. The action is
      // queued behind the navigation; its redirected state is applied
      // silently (a server action is not a tracked transition) and the
      // redirect target is then pushed as a real, tracked navigation of its
      // own. Nothing about the redirect may be attributed to the pending
      // /dashboard transition.
      const baseline = after.length
      await browser.elementById('push-then-redirect-action').click()
      await browser.elementByCss('#some-page')

      // Every start settles with exactly one terminal event.
      const fresh = await retry(async () => {
        const fresh = (await getTransitionEvents(browser)).slice(baseline)
        const freshStarts = fresh.filter((e) => e.phase === 'start')
        expect(freshStarts).toHaveLength(2)
        for (const start of freshStarts) {
          const terminals = fresh.filter(
            (e) =>
              (e.phase === 'commit' || e.phase === 'abort') &&
              e.event.id === start.event.id
          )
          expect(terminals).toHaveLength(1)
        }
        return fresh
      })
      const starts = fresh.filter((e) => e.phase === 'start')
      const commits = fresh.filter((e) => e.phase === 'commit')
      const aborts = fresh.filter((e) => e.phase === 'abort')
      expect(starts.map((e) => e.url)).toEqual(['/dashboard', '/some-page'])

      // The redirect's own navigation commits, as itself — never as the
      // /dashboard transition.
      const redirectCommit = commits.find(
        (e) => e.event.id === starts[1].event.id
      )
      expect(redirectCommit.url).toBe('/some-page')
      expect(redirectCommit.event.to.renderedPathname).toBe('/some-page')

      // The /dashboard transition either committed its own state before the
      // redirect landed, or was aborted by the redirect navigation's commit —
      // scheduling decides which, but a commit may only describe /dashboard,
      // and an abort may only name the redirect's commit as its replacer.
      const dashboardCommit = commits.find(
        (e) => e.event.id === starts[0].event.id
      )
      if (dashboardCommit !== undefined) {
        expect(dashboardCommit.event.to.renderedPathname).toBe('/dashboard')
        expect(aborts).toHaveLength(0)
      } else {
        expect(aborts.map((e) => e.event.id)).toEqual([starts[0].event.id])
        expect(aborts[0].event.replacedBy).toBe(redirectCommit.event.id)
      }
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

    it('isolates throwing hooks: navigation, aborts, and later lifecycles are unaffected', async () => {
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

      // A throwing start hook runs synchronously inside the dispatch call
      // stack (commit/abort hooks run in effects), so it must not break the
      // dispatch either. All three hooks share the same per-call guard.
      await browser.eval(`window.__THROW_ON_START = true`)
      await browser.elementByCss('a[href="/some-page"]').click()
      await browser.elementById('some-page')
      await retry(async () => {
        const events = await getTransitionEvents(browser)
        // The recorder threw before recording its own start, but the
        // navigation completed and its commit was still delivered.
        expect(events.filter((e) => e.phase === 'commit')).toHaveLength(2)
      })
      expect(
        (await browser.log()).filter((log) =>
          log.message.includes(
            'An instrumentation-client router transition hook failed'
          )
        )
      ).toHaveLength(2)
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
