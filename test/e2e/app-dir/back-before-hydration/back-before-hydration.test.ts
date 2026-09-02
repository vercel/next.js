import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type * as Playwright from 'playwright'

// Reproduces a URL/content desync when the browser's Back button is pressed
// while a reloaded page has committed but not yet hydrated.
//
// Setup: navigate client-side so both history entries are same-document
// entries created via pushState, then reload. Chrome preserves the
// same-document association across a reload, so a Back traversal that happens
// before the new document hydrates is an *instant same-document* traversal:
// the URL bar changes and popstate fires, but no router is attached yet, so
// the rendered content stays on the reloaded page. When hydration then
// completes, the router assumes the current URL matches its payload and calls
// replaceState() with the payload tree onto the traversed entry. From that
// point the URL bar and the content permanently disagree, and subsequent
// Back/Forward traversals update the URL bar without ever changing what is
// rendered.
//
// In manual testing this is easiest to hit with a hard reload (shift+cmd+R)
// because the widened commit-to-hydration window makes the race human-sized;
// here we make it deterministic by stalling the static scripts instead.
//
// Every scenario runs twice: against pages with no Suspense boundary above
// them, and against pages below a Suspense-wrapped layout. These exercise
// different recovery codepaths: without a boundary, a suspended traversal
// holds the transition until its data is ready; with one, it can commit the
// boundary's fallback and then depends on React retrying when the data
// resolves. Under cacheComponents the boundary variant regressed into a
// permanently blank page (#95848) while the boundary-less variant recovered.
describe('back navigation before hydration after reload', () => {
  const { next } = nextTestSetup({ files: __dirname })

  // Stalls every static script on the page so a committed document cannot
  // start hydrating until released. (Routing a pattern also disables the
  // browser HTTP cache for it, so cached scripts are stalled too.)
  async function stallScripts(page: Playwright.Page) {
    let stalling = true
    const stalled: Array<() => void> = []
    await page.route('**/_next/static/**', async (route) => {
      if (stalling && route.request().resourceType() === 'script') {
        await new Promise<void>((resolve) => stalled.push(resolve))
      }
      await route.continue()
    })
    return function releaseScripts() {
      stalling = false
      for (const release of stalled) release()
    }
  }

  // Waits for the heading of the page we expect to end up on; every page has
  // its own heading id. `waitUntil` is off because the load event doesn't fire
  // until the released scripts have run, which is most of what we're waiting
  // for.
  function waitForPage(
    browser: Awaited<ReturnType<typeof next.browser>>,
    headingSelector: string
  ) {
    return browser.elementByCss(headingSelector, {
      waitUntil: false,
      timeout: 10_000,
    })
  }

  // Navigates client-side (creating a same-document sibling entry), then
  // reloads with scripts stalled, returning as soon as the new document
  // commits. `window.__stayed` is set on the committed document so tests can
  // assert that hydration did not cause a full reload.
  //
  // NOTE: while scripts are stalled, only the raw Playwright `page` may be
  // used — most `browser.*` helpers wait for the `load` event, which the
  // stalled scripts block.
  async function clickThenReloadStalled(
    startPath: string,
    linkId: string,
    headingSelectorAfterClick: string
  ) {
    let page: Playwright.Page
    const browser = await next.browser(startPath, {
      beforePageLoad(p: Playwright.Page) {
        page = p
      },
    })

    await browser.elementById(linkId).click()
    await waitForPage(browser, headingSelectorAfterClick)

    const releaseScripts = await stallScripts(page)
    await browser.refresh({ waitUntil: 'commit' })
    await page.evaluate('window.__stayed = true')

    return { browser, page, releaseScripts }
  }

  // Loads a path directly with scripts stalled from the start, so the
  // initial document is parsed but not hydrated until released. Waits for
  // `readySelector` since document events are blocked by the stalled scripts.
  async function loadStalled(startPath: string, readySelector: string) {
    let page: Playwright.Page
    let releaseScripts: () => void
    const browser = await next.browser(startPath, {
      waitUntil: 'commit',
      waitHydration: false,
      async beforePageLoad(p: Playwright.Page) {
        page = p
        releaseScripts = await stallScripts(p)
      },
    })
    await page.waitForSelector(readySelector)
    await page.evaluate('window.__stayed = true')
    return { browser, page, releaseScripts }
  }

  describe.each([
    { label: 'no Suspense boundary above the page', prefix: '' },
    { label: 'Suspense boundary above the page', prefix: '/suspense' },
  ])('$label', ({ prefix }) => {
    const homePath = prefix === '' ? '/' : prefix
    const postPath = `${prefix}/post`
    const searchPath = `${prefix}/search`

    it('reconciles the URL with the rendered content once hydration completes', async () => {
      const { browser, releaseScripts } = await clickThenReloadStalled(
        homePath,
        'to-post',
        '#post'
      )

      // Back while the reloaded document is not hydrated: an instant
      // same-document traversal handled by nobody.
      await browser.back({ waitUntil: 'commit' })
      expect(new URL(await browser.url()).pathname).toBe(homePath)

      releaseScripts()

      // We traversed back, so once the router is up it must render the home
      // page (or otherwise bring URL and content back in sync).
      await waitForPage(browser, '#home')
      expect(new URL(await browser.url()).pathname).toBe(homePath)

      // History traversal must still work after recovery.
      await browser.forward()
      await waitForPage(browser, '#post')
      expect(new URL(await browser.url()).pathname).toBe(postPath)

      await browser.back()
      await waitForPage(browser, '#home')
      expect(new URL(await browser.url()).pathname).toBe(homePath)
    })

    it('reconciles when the traversed entry differs only in search params', async () => {
      const { browser, releaseScripts } = await clickThenReloadStalled(
        `${searchPath}?page=1`,
        'to-page-2',
        '#page-2'
      )

      await browser.back({ waitUntil: 'commit' })
      expect(new URL(await browser.url()).search).toBe('?page=1')

      releaseScripts()

      await waitForPage(browser, '#page-1')
      expect(new URL(await browser.url()).search).toBe('?page=1')

      await browser.forward()
      await waitForPage(browser, '#page-2')
      expect(new URL(await browser.url()).search).toBe('?page=2')
    })

    // History changes before hydration that are NOT missed traversals must
    // not trigger any recovery: the router should adopt the current entry on
    // its first history write, and in particular never cause a full reload.
    describe('other history changes before hydration', () => {
      it('adopts a third-party pushState', async () => {
        const { browser, page, releaseScripts } = await loadStalled(
          postPath,
          '#post'
        )

        // e.g. analytics/consent tooling running before the framework.
        await page.evaluate(
          `window.history.pushState({ thirdParty: true }, '', '${postPath}?tp=1')`
        )
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(await browser.elementByCss('h1').text()).toBe('Post')
          expect(new URL(await browser.url()).search).toBe('?tp=1')
        })

        // The router still navigates.
        await browser.elementById('to-home').click()
        await waitForPage(browser, '#home')
      })

      it('keeps an in-page anchor jump on a fresh load', async () => {
        const { browser, page, releaseScripts } = await loadStalled(
          postPath,
          '#post'
        )

        await page.click('#hash-link')
        expect(new URL(page.url()).hash).toBe('#section')
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(await browser.elementByCss('h1').text()).toBe('Post')
          expect(new URL(await browser.url()).hash).toBe('#section')
        })

        // Hash traversals keep behaving like same-page jumps.
        await browser.back()
        await retry(async () => {
          expect(new URL(await browser.url()).hash).toBe('')
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })
        await browser.forward()
        await retry(async () => {
          expect(new URL(await browser.url()).hash).toBe('#section')
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })
      })

      it('keeps an in-page anchor jump between a reload and hydration', async () => {
        const { browser, page, releaseScripts } = await clickThenReloadStalled(
          homePath,
          'to-post',
          '#post'
        )

        await page.click('#hash-link')
        expect(new URL(page.url()).hash).toBe('#section')
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(await browser.elementByCss('h1').text()).toBe('Post')
          expect(new URL(await browser.url()).hash).toBe('#section')
        })

        // Traversing over the hash entry and the pushState entry still works.
        await browser.back() // -> post
        await browser.back() // -> home
        await waitForPage(browser, '#home')
        expect(new URL(await browser.url()).pathname).toBe(homePath)
      })

      it('handles a pushState followed by back', async () => {
        const { browser, page, releaseScripts } = await loadStalled(
          postPath,
          '#post'
        )

        await page.evaluate(
          `window.history.pushState({ thirdParty: true }, '', '${postPath}?tp=1')`
        )
        await page.evaluate(`window.history.back()`)
        await retry(async () => {
          expect(new URL(page.url()).search).toBe('')
        })
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })

        await browser.elementById('to-home').click()
        await waitForPage(browser, '#home')
      })

      it('leaves the traversal unhandled when a third-party write lands before the replay', async () => {
        const { browser, page, releaseScripts } = await clickThenReloadStalled(
          homePath,
          'to-post',
          '#post'
        )

        await browser.back({ waitUntil: 'commit' })
        expect(new URL(await browser.url()).pathname).toBe(homePath)

        // Arms an effect in the fixture that pushes a third-party history
        // entry between the router's traversal detection and its replay.
        await page.evaluate('window.__injectThirdPartyPush = true')
        releaseScripts()

        await retry(async () => {
          // The traversal cannot be replayed onto the third-party entry. The
          // content stays on the reloaded page, like before the fix — and in
          // particular the router must not reload a page that just loaded.
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(new URL(await browser.url()).search).toBe('?tp=1')
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })

        await browser.elementById('to-home').click()
        await waitForPage(browser, '#home')
      })

      it('handles a traversal onto a third-party entry', async () => {
        const { browser, page, releaseScripts } = await loadStalled(
          postPath,
          '#post'
        )

        await page.evaluate(
          `window.history.pushState({ a: 1 }, '', '${postPath}?tp=1')`
        )
        await page.evaluate(
          `window.history.pushState({ b: 2 }, '', '${postPath}?tp=2')`
        )
        await page.evaluate(`window.history.back()`)
        await retry(async () => {
          expect(new URL(page.url()).search).toBe('?tp=1')
        })
        releaseScripts()

        await retry(async () => {
          expect(await browser.eval('window.__stayed')).toBe(true)
          expect(await browser.elementByCss('h1').text()).toBe('Post')
        })
      })
    })
  })
})
