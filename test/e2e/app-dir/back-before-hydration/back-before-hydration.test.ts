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

  // The layout renders the router's pathname and search params once the
  // router is attached (see app/router-url.tsx), so waiting for a value here
  // also waits for hydration.
  function readRouterUrl(
    browser: Awaited<ReturnType<typeof next.browser>>
  ): Promise<string> {
    return browser.eval(
      'document.getElementById("router-url")?.textContent ?? ""'
    )
  }

  // Waits until the document is parsed. The stalled scripts are async, so
  // they do not hold this up. Acting on history only after this point makes
  // the tested window "inline scripts have run, external scripts have not"
  // rather than wherever the parser happened to be.
  async function waitForDocumentParsing(page: Playwright.Page) {
    await page.waitForFunction(() => document.readyState !== 'loading')
  }

  // Navigates client-side (creating a same-document sibling entry), then
  // reloads with scripts stalled, returning once the new document is parsed.
  // `window.__stayed` is set on that document so tests can assert that
  // hydration did not cause a full reload.
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
    await waitForDocumentParsing(page)
    await page.evaluate('window.__stayed = true')

    return { browser, page, releaseScripts }
  }

  // Loads a path directly with scripts stalled from the start, so the
  // initial document is parsed but not hydrated until released.
  async function loadStalled(startPath: string) {
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
    await waitForDocumentParsing(page)
    await page.evaluate('window.__stayed = true')
    return { browser, page, releaseScripts }
  }

  const homePath = '/'
  const postPath = '/post'
  const searchPath = '/search'

  it('reconciles the URL with the rendered content once hydration completes', async () => {
    const { browser, page, releaseScripts } = await clickThenReloadStalled(
      homePath,
      'to-post',
      '#post'
    )

    // Back while the reloaded document is not hydrated: an instant
    // same-document traversal handled by nobody.
    await browser.back({ waitUntil: 'commit' })
    expect(new URL(await browser.url()).pathname).toBe(homePath)

    // The server rendered the post page. Hydration must match it even though
    // the URL now says otherwise.
    await page.evaluate(
      'document.getElementById("server-pathname").__server = true'
    )
    releaseScripts()

    // We traversed back, so once the router is up it must render the home
    // page (or otherwise bring URL and content back in sync).
    await waitForPage(browser, '#home')
    expect(new URL(await browser.url()).pathname).toBe(homePath)
    await retry(async () => {
      expect(await readRouterUrl(browser)).toBe(homePath)
    })
    expect(
      await browser.eval('document.getElementById("server-pathname").__server')
    ).toBe(true)

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
    await retry(async () => {
      expect(await readRouterUrl(browser)).toBe(`${searchPath}?page=1`)
    })

    await browser.forward()
    await waitForPage(browser, '#page-2')
    expect(new URL(await browser.url()).search).toBe('?page=2')
  })

  // The control case: a reload with no history change must hydrate the
  // server HTML in place, and the recovery above must not kick in.
  it('hydrates in place on an ordinary reload', async () => {
    const { browser, page, releaseScripts } = await clickThenReloadStalled(
      homePath,
      'to-post',
      '#post'
    )

    // Tag the server-rendered heading so we can tell hydration from a
    // client-side re-render of the page.
    await page.evaluate('document.getElementById("post").__server = true')
    releaseScripts()

    await retry(async () => {
      expect(await readRouterUrl(browser)).toBe(postPath)
    })
    expect(await browser.eval('window.__stayed')).toBe(true)
    expect(await browser.eval('document.getElementById("post").__server')).toBe(
      true
    )

    await browser.elementById('to-home').click()
    await waitForPage(browser, '#home')
    await browser.back()
    await waitForPage(browser, '#post')
    expect(await browser.eval('window.__stayed')).toBe(true)
  })

  // History changes before hydration that are NOT missed traversals must
  // not trigger any recovery: the router should adopt the current entry on
  // its first history write, and in particular never cause a full reload.
  describe('other history changes before hydration', () => {
    it('adopts a third-party pushState', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

      // e.g. analytics/consent tooling running before the framework.
      await page.evaluate(
        `window.history.pushState({ thirdParty: true }, '', '${postPath}?tp=1')`
      )
      releaseScripts()

      await retry(async () => {
        expect(await browser.eval('window.__stayed')).toBe(true)
        expect(await browser.elementByCss('h1').text()).toBe('Post')
        expect(new URL(await browser.url()).search).toBe('?tp=1')
        expect(await readRouterUrl(browser)).toBe(`${postPath}?tp=1`)
      })

      // The router still navigates.
      await browser.elementById('to-home').click()
      await waitForPage(browser, '#home')
    })

    it('keeps an in-page anchor jump on a fresh load', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

      await page.click('#hash-link')
      expect(new URL(page.url()).hash).toBe('#section')
      releaseScripts()

      await retry(async () => {
        expect(await browser.eval('window.__stayed')).toBe(true)
        expect(await browser.elementByCss('h1').text()).toBe('Post')
        expect(new URL(await browser.url()).hash).toBe('#section')
        expect(await readRouterUrl(browser)).toBe(postPath)
      })

      // Hash traversals keep behaving like same-page jumps.
      await browser.back()
      await retry(async () => {
        expect(new URL(await browser.url()).hash).toBe('')
        expect(await browser.elementByCss('h1').text()).toBe('Post')
        expect(await readRouterUrl(browser)).toBe(postPath)
      })
      await browser.forward()
      await retry(async () => {
        expect(new URL(await browser.url()).hash).toBe('#section')
        expect(await browser.elementByCss('h1').text()).toBe('Post')
        expect(await readRouterUrl(browser)).toBe(postPath)
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
        expect(await readRouterUrl(browser)).toBe(postPath)
      })

      // Traversing over the hash entry and the pushState entry still works.
      await browser.back() // -> post
      await browser.back() // -> home
      await waitForPage(browser, '#home')
      expect(new URL(await browser.url()).pathname).toBe(homePath)
    })

    it('handles a pushState followed by back', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

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
        expect(await readRouterUrl(browser)).toBe(postPath)
      })

      // The entry pushed before hydration is still traversable.
      await browser.forward()
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(`${postPath}?tp=1`)
      })
      expect(await browser.eval('window.history.state.thirdParty')).toBe(true)
      expect(await browser.eval('window.__stayed')).toBe(true)
      await browser.back()
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(postPath)
      })
      expect(await browser.eval('window.__stayed')).toBe(true)

      await browser.elementById('to-home').click()
      await waitForPage(browser, '#home')
    })

    it('handles a third-party write that lands during hydration', async () => {
      const { browser, page, releaseScripts } = await clickThenReloadStalled(
        homePath,
        'to-post',
        '#post'
      )

      await browser.back({ waitUntil: 'commit' })
      expect(new URL(await browser.url()).pathname).toBe(homePath)

      // Arms an effect in the fixture that pushes a third-party history
      // entry after hydration has committed but before the router's own
      // effect has run.
      await page.evaluate('window.__injectThirdPartyPush = true')
      releaseScripts()

      await retry(async () => {
        // The entry was pushed from the traversed-to home entry, so it
        // renders the home page at the pushed URL.
        expect(await browser.eval('window.__stayed')).toBe(true)
        expect(new URL(await browser.url()).search).toBe('?tp=1')
        expect(await browser.elementByCss('h1').text()).toBe('Home')
        expect(await readRouterUrl(browser)).toBe(`${homePath}?tp=1`)
      })

      await browser.elementById('to-post').click()
      await waitForPage(browser, '#post')
    })

    describe.each([
      { method: 'pushState' as const, search: '?after=back-push' },
      { method: 'replaceState' as const, search: '?after=back-replace' },
    ])('$method after an early traversal', ({ method, search }) => {
      it('renders the traversed-to page at the written URL', async () => {
        const { browser, page, releaseScripts } = await clickThenReloadStalled(
          homePath,
          'to-post',
          '#post'
        )

        await browser.back({ waitUntil: 'commit' })
        await page.evaluate(
          `window.history.${method}({ thirdParty: true }, '', '${homePath}${search}')`
        )
        releaseScripts()

        await waitForPage(browser, '#home')
        await retry(async () => {
          expect(await readRouterUrl(browser)).toBe(`${homePath}${search}`)
        })
        expect(await browser.eval('window.__stayed')).toBe(true)

        await browser.elementById('to-post').click()
        await waitForPage(browser, '#post')
        await browser.back()
        await waitForPage(browser, '#home')
        expect(new URL(await browser.url()).search).toBe(search)
        expect(await browser.eval('window.__stayed')).toBe(true)
      })
    })

    it('does not render onto an entry marked by a previous document', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

      await page.evaluate(`window.history.pushState(null, '', '${homePath}')`)
      releaseScripts()
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(homePath)
      })

      // The reloaded document renders the home page. The entry left behind at
      // /post was marked by the previous document, whose payload is gone, so
      // going back to it must not render the home page there.
      await browser.refresh()
      await waitForPage(browser, '#home')
      await browser.eval('window.__reloaded = true')
      await browser.back()
      await waitForPage(browser, '#post')
      expect(new URL(await browser.url()).pathname).toBe(postPath)
      expect(await browser.eval('window.__reloaded')).not.toBe(true)
    })

    // Writes that bypass history.pushState/replaceState (or come from another
    // framework) leave entries the router knows nothing about.
    it('adopts an unknown entry on the same route', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

      await page.evaluate(
        `History.prototype.pushState.call(window.history, { foreign: true }, '', '${postPath}')`
      )
      releaseScripts()

      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(postPath)
      })
      expect(await browser.eval('window.__stayed')).toBe(true)
      expect(await browser.eval('window.history.state.foreign')).toBe(true)

      await browser.elementById('to-home').click()
      await waitForPage(browser, '#home')
      await browser.back()
      await waitForPage(browser, '#post')
      expect(await browser.eval('window.history.state.foreign')).toBe(true)
      expect(await browser.eval('window.__stayed')).toBe(true)
    })

    it('keeps a history wrapper installed before hydration', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

      await page.evaluate(() => {
        const replaceState = window.history.replaceState
        const testWindow = window as typeof window & {
          __replaceStateCalls: number
        }
        testWindow.__replaceStateCalls = 0
        window.history.replaceState = function (...args) {
          testWindow.__replaceStateCalls++
          return replaceState.apply(this, args)
        }
      })
      releaseScripts()

      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(postPath)
      })
      const callsBeforeWrite = await browser.eval('window.__replaceStateCalls')
      await browser.eval(
        `window.history.replaceState({ thirdParty: true }, '', '${postPath}?wrapped=1')`
      )
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(`${postPath}?wrapped=1`)
        expect(
          await browser.eval('window.__replaceStateCalls')
        ).toBeGreaterThan(callsBeforeWrite)
      })
      expect(await browser.eval('window.history.state.thirdParty')).toBe(true)
    })

    it('handles a traversal onto a third-party entry', async () => {
      const { browser, page, releaseScripts } = await loadStalled(postPath)

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
        expect(await readRouterUrl(browser)).toBe(`${postPath}?tp=1`)
      })
      expect(await browser.eval('window.history.state.a')).toBe(1)

      // Both early entries remain traversable.
      await browser.forward()
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(`${postPath}?tp=2`)
      })
      expect(await browser.eval('window.history.state.b')).toBe(2)
      await browser.back()
      await retry(async () => {
        expect(await readRouterUrl(browser)).toBe(`${postPath}?tp=1`)
      })
      expect(await browser.eval('window.__stayed')).toBe(true)
    })
  })
})
