import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from 'next-webdriver'

describe('back-to-native-hash-entry', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function expectPage(
    browser: Playwright,
    heading: string,
    pathWithHash: string
  ) {
    await retry(async () => {
      const url = new URL(await browser.url())
      expect({
        url: url.pathname + url.search + url.hash,
        heading: await browser.elementByCss('#page-heading').text(),
      }).toEqual({ url: pathWithHash, heading })
    })
  }

  async function openPageA() {
    const browser = await next.browser('/')
    await expectPage(browser, 'Page A', '/')
    // Survives client-side navigations, but not a document reload.
    await browser.eval('window.__NO_RELOAD_MARKER = true')
    return browser
  }

  async function expectNoReload(browser: Playwright) {
    expect(await browser.eval('window.__NO_RELOAD_MARKER')).toBe(true)
  }

  async function expectSectionScrolledIntoView(browser: Playwright) {
    await retry(async () => {
      const top = await browser.eval(
        `document.getElementById('section').getBoundingClientRect().top`
      )
      expect(Math.abs(top)).toBeLessThanOrEqual(1)
    })
  }

  it('renders the page that owns a native hash entry on Back', async () => {
    const browser = await openPageA()

    await browser.elementByCss('#native-hash-link').click()
    await expectPage(browser, 'Page A', '/#section')
    await expectSectionScrolledIntoView(browser)

    await browser.elementByCss('#link-to-b').click()
    await expectPage(browser, 'Page B', '/b')

    await browser.back()
    await expectPage(browser, 'Page A', '/#section')

    await browser.forward()
    await expectPage(browser, 'Page B', '/b')

    await browser.back()
    await expectPage(browser, 'Page A', '/#section')

    await browser.back()
    await expectPage(browser, 'Page A', '/')

    await expectNoReload(browser)
  })

  it('does not reload when setting window.location.hash', async () => {
    const browser = await openPageA()

    // Regression coverage for #90268: setting the hash must not reload the page.
    await browser.eval(`window.location.hash = 'section'`)
    await expectPage(browser, 'Page A', '/#section')
    await expectSectionScrolledIntoView(browser)
    await expectNoReload(browser)

    await browser.elementByCss('#link-to-b').click()
    await expectPage(browser, 'Page B', '/b')

    await browser.back()
    await expectPage(browser, 'Page A', '/#section')
    await expectNoReload(browser)

    await browser.back()
    await expectPage(browser, 'Page A', '/')

    await browser.forward()
    await expectPage(browser, 'Page A', '/#section')
    await expectSectionScrolledIntoView(browser)
    await expectNoReload(browser)
  })

  it('renders the page that owns a next/link hash entry on Back', async () => {
    const browser = await openPageA()

    await browser.elementByCss('#link-hash-link').click()
    await expectPage(browser, 'Page A', '/#section')

    await browser.elementByCss('#link-to-b').click()
    await expectPage(browser, 'Page B', '/b')

    await browser.back()
    await expectPage(browser, 'Page A', '/#section')

    await expectNoReload(browser)
  })

  it('reloads on Back to an entry without router state for another page', async () => {
    const browser = await openPageA()

    // Create a hash entry the router never observed (like one created before
    // hydration) by bypassing the router's patched `history.pushState`.
    await browser.eval(
      `History.prototype.pushState.call(window.history, null, '', '/#unobserved')`
    )
    expect(await browser.eval('window.history.state')).toBe(null)

    await browser.elementByCss('#link-to-b').click()
    await expectPage(browser, 'Page B', '/b')

    await browser.back()
    await expectPage(browser, 'Page A', '/#unobserved')

    // The router can't restore an entry without its tree on the client.
    await retry(async () => {
      expect(await browser.eval('window.__NO_RELOAD_MARKER')).toBeUndefined()
    })
  })

  it.each(['pushState', 'replaceState'])(
    'does not reload on a native hash link right after a userland %s',
    async (method) => {
      const browser = await openPageA()

      // The router applies the userland URL update in a transition, so the
      // fragment navigation happens before that update commits. It must still
      // be recognized as a fragment navigation within the rendered page.
      await browser.eval(`
        window.history.${method}(null, '', '?filter=1')
        document.getElementById('native-hash-link').click()
      `)
      await retry(async () => {
        expect({
          search: await browser.eval('window.location.search'),
          heading: await browser.elementByCss('#page-heading').text(),
        }).toEqual({ search: '?filter=1', heading: 'Page A' })
      })
      await browser.waitForIdleNetwork()
      await expectNoReload(browser)
    }
  )

  it('does not reload on Back/Forward between native hash entries of the same page', async () => {
    const browser = await openPageA()

    await browser.elementByCss('#native-hash-link').click()
    await expectPage(browser, 'Page A', '/#section')
    await expectSectionScrolledIntoView(browser)

    await browser.back()
    await expectPage(browser, 'Page A', '/')

    await browser.forward()
    await expectPage(browser, 'Page A', '/#section')
    await expectSectionScrolledIntoView(browser)

    await expectNoReload(browser)
  })
})
