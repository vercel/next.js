import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-dev', () => {
  const { next, skipped, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('should update cached data after editing a file', async () => {
      const browser = await next.browser('/')

      const [initialFetchedRandom, initialText, initialMathRandom] =
        await Promise.all([
          browser.elementById('fetchedRandom').text(),
          browser.elementById('text').text(),
          browser.elementById('mathRandom').text(),
        ])

      expect(initialFetchedRandom).toMatch(/[0,1]\.\d+/)
      expect(initialText).toBe('foo')
      expect(initialMathRandom).toMatch(/[0,1]\.\d+/)

      // Edit something inside of "use cache" in the page.tsx file.
      await next.patchFile('app/page.tsx', (content) =>
        content.replace('foo', 'bar')
      )

      let newFetchedRandom: string
      let newText: string
      let newMathRandom: string

      await retry(async () => {
        ;[newFetchedRandom, newText, newMathRandom] = await Promise.all([
          browser.elementById('fetchedRandom').text(),
          browser.elementById('text').text(),
          browser.elementById('mathRandom').text(),
        ])

        // Cached via server components HMR cache:
        expect(newFetchedRandom).toBe(initialFetchedRandom)

        // Edited value:
        expect(newText).toBe('bar')

        // Newly computed value due to cache miss.
        expect(newMathRandom).not.toBe(initialMathRandom)
        expect(newMathRandom).toMatch(/[0,1]\.\d+/)
      })

      // Now revert the edit.
      await next.patchFile('app/page.tsx', (content) =>
        content.replace('bar', 'foo')
      )

      await retry(async () => {
        const [fetchedRandom, text, mathRandom] = await Promise.all([
          browser.elementById('fetchedRandom').text(),
          browser.elementById('text').text(),
          browser.elementById('mathRandom').text(),
        ])

        // Cached via server components HMR cache:
        expect(fetchedRandom).toBe(initialFetchedRandom)

        // Edited value:
        expect(text).toBe(initialText)

        // Newly computed value due to cache miss, because the initial request did
        // not use an HMR hash for the cache key.
        // TODO: Can we get a cache hit here? It's a micro optimization though.
        expect(mathRandom).not.toBe(initialFetchedRandom)
        expect(mathRandom).not.toBe(newMathRandom)
        expect(mathRandom).toMatch(/[0,1]\.\d+/)
      })

      // Apply the initial edit again.
      await next.patchFile(
        'app/page.tsx',
        (content) => content.replace('foo', 'bar'),
        async () =>
          retry(async () => {
            const [fetchedRandom, text, mathRandom] = await Promise.all([
              browser.elementById('fetchedRandom').text(),
              browser.elementById('text').text(),
              browser.elementById('mathRandom').text(),
            ])

            // This should be a full cache hit now:
            expect(fetchedRandom).toBe(newFetchedRandom)
            expect(text).toBe(newText)

            if (isTurbopack) {
              // TODO: Turbopack does not provide content hashes during HMR, so we
              // actually get a cache miss. However, fetchedRandom is still cached
              // because of the server components HMR cache.
              expect(mathRandom).not.toBe(newMathRandom)
              expect(mathRandom).toMatch(/[0,1]\.\d+/)
            } else {
              expect(mathRandom).toBe(newMathRandom)
            }
          })
      )
    })

    // These two currently fail in both Turbopack and Webpack. Dev "use cache"
    // invalidation relies on the __next_hmr_refresh_hash__ cookie that the
    // browser HMR client sets after an edit; a client that fetches directly
    // (curl, a plain fetch, a second device) never sends that cookie, so the
    // "use cache" key does not change across the edit and the stale entry is
    // reused. Change these to `it` once editing a file invalidates cached data
    // for requests that do not carry the cookie, covering both route handlers
    // and pages.
    it.failing(
      'should update cached data used by a route handler after editing a file',
      async () => {
        const initialData = await next
          .fetch('/api/cached')
          .then((res) => res.json())

        expect(initialData.text).toBe('foo')
        expect(initialData.uncachedText).toBe('foo')
        expect(initialData.mathRandom).toEqual(expect.any(Number))

        // A subsequent fetch returns the same cached value.
        const cachedData = await next
          .fetch('/api/cached')
          .then((res) => res.json())

        expect(cachedData.text).toBe('foo')
        expect(cachedData.mathRandom).toBe(initialData.mathRandom)

        // Edit the source literals inside and outside of "use cache".
        await next.patchFile('app/api/cached/route.ts', (content) =>
          content.replaceAll('foo', 'bar')
        )

        // Wait until the route handler module has recompiled. The uncached
        // value is read outside of "use cache", so it reflects the edited
        // source. This ensures we then assert the cached value against the
        // post-edit module, not a request that raced the recompilation.
        await retry(async () => {
          const recompiledData = await next
            .fetch('/api/cached')
            .then((res) => res.json())

          expect(recompiledData.uncachedText).toBe('bar')
        })

        const newData = await next
          .fetch('/api/cached')
          .then((res) => res.json())

        // The cached function should return the edited value and recompute its
        // random value due to a cache miss.
        expect(newData.text).toBe('bar')
        expect(newData.mathRandom).not.toBe(initialData.mathRandom)
      }
    )

    it.failing(
      'should update cached data used by a page fetched without a cookie after editing a file',
      async () => {
        // `next.render$` fetches directly, without the browser HMR client, so
        // the request does not carry the __next_hmr_refresh_hash__ cookie.
        let $ = await next.render$('/cached-page')
        const initialText = $('#text').text()
        const initialMathRandom = $('#mathRandom').text()

        expect(initialText).toBe('foo')
        expect($('#uncachedText').text()).toBe('foo')

        // A subsequent fetch returns the same cached value.
        $ = await next.render$('/cached-page')

        expect($('#text').text()).toBe('foo')
        expect($('#mathRandom').text()).toBe(initialMathRandom)

        // Edit the source literals inside and outside of "use cache".
        await next.patchFile('app/cached-page/page.tsx', (content) =>
          content.replaceAll('foo', 'bar')
        )

        // Wait until the page module has recompiled. The uncached value is read
        // outside of "use cache", so it reflects the edited source. This
        // ensures we then assert the cached value against the post-edit module,
        // not a request that raced the recompilation.
        await retry(async () => {
          const $$ = await next.render$('/cached-page')

          expect($$('#uncachedText').text()).toBe('bar')
        })

        $ = await next.render$('/cached-page')

        // The cached function should return the edited value and recompute its
        // random value due to a cache miss.
        expect($('#text').text()).toBe('bar')
        expect($('#mathRandom').text()).not.toBe(initialMathRandom)
      }
    )

    it('should return cached data after reload', async () => {
      let $ = await next.render$('/')
      const initialContent = $('#container').text()
      $ = await next.render$('/')
      const content = $('#container').text()

      expect(content).toEqual(initialContent)
    })

    it('should return fresh data after hard reload', async () => {
      let $ = await next.render$('/')
      const initialContent = $('#container').text()

      $ = await next.render$(
        '/',
        {},
        { headers: { 'cache-control': 'no-cache' } }
      )

      const hardReloadContent = $('#container').text()

      expect(hardReloadContent).not.toEqual(initialContent)

      // After a subsequent soft reload, cached data from the hard reload should
      // be returned.

      const softReloadContent = $('#container').text()

      expect(softReloadContent).toEqual(hardReloadContent)
    })

    it('should successfully finish compilation when "use cache" directive is added/removed', async () => {
      await next.browser('/')
      let cliOutputLength = next.cliOutput.length

      // Disable "use cache" directive
      await next.patchFile('app/page.tsx', (content) =>
        content.replace(`'use cache'`, `// 'use cache'`)
      )

      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputLength)).toInclude('GET / 200')
      }, 10_000)

      cliOutputLength = next.cliOutput.length

      // Re-enable "use cache" directive
      await next.patchFile('app/page.tsx', (content) =>
        content.replace(`// 'use cache'`, `'use cache'`)
      )

      await retry(async () => {
        expect(next.cliOutput.slice(cliOutputLength)).toInclude('GET / 200')
      }, 10_000)
    })

    it('should handle edits on nested pages', async () => {
      // This is a regression test that ensures that setting the HMR refresh
      // hash cookie is not done per path, leading to a stale cookie being used
      // for nested pages.
      const browser = await next.browser('/')

      // Edit something in the root page.tsx file.
      await next.patchFile('app/page.tsx', (content) =>
        content.replace('foo', 'bar')
      )

      // Navigate to the nested page. This an explicit hard navigation. A soft
      // navigation plus refresh would also reproduce the issue.
      await browser.loadPage(new URL('/some/path', next.url).href)

      expect(await browser.elementById('greeting').text()).toBe('Hi')

      // Edit something in the nested page.tsx file.
      await next.patchFile('app/some/path/page.tsx', (content) =>
        content.replace('Hi', 'Hello')
      )

      await retry(async () => {
        expect(await browser.elementById('greeting').text()).toBe('Hello')
      })
    })
  } else {
    it('should ignore an existing HMR refresh hash cookie with "next start"', async () => {
      const browser = await next.browser('/')

      const [initialFetchedRandom, initialMathRandom] = await Promise.all([
        browser.elementById('fetchedRandom').text(),
        browser.elementById('mathRandom').text(),
      ])

      await browser.addCookie({
        name: '__next_hmr_refresh_hash__',
        value: 'test',
      })

      // First, revalidate the prerendered page with a server action. This uses
      // a request work unit store, so the HMR refresh cookie is available.

      await browser.elementById('revalidate').click()

      let revalidatedFetchedRandom: string
      let revalidatedMathRandom: string

      await retry(async () => {
        ;[revalidatedFetchedRandom, revalidatedMathRandom] = await Promise.all([
          browser.elementById('fetchedRandom').text(),
          browser.elementById('mathRandom').text(),
        ])

        expect(revalidatedFetchedRandom).not.toBe(initialFetchedRandom)
        expect(revalidatedMathRandom).not.toBe(initialMathRandom)
      })

      let initialUncached = await browser.elementById('uncached').text()

      // Now refresh the page. Due to the prior revalidation it will be a cache
      // miss, and the page will be prerendered. This uses a prerender work unit
      // store, so the HMR refresh cookie is not available.

      await browser.refresh()

      await retry(async () => {
        const [fetchedRandom, mathRandom, uncached] = await Promise.all([
          browser.elementById('fetchedRandom').text(),
          browser.elementById('mathRandom').text(),
          browser.elementById('uncached').text(),
        ])

        expect(uncached).not.toBe(initialUncached)
        expect(fetchedRandom).toBe(revalidatedFetchedRandom)
        expect(mathRandom).toBe(revalidatedMathRandom)
      })
    })
  }
})
