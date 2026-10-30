import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression tests for https://github.com/vercel/next.js/issues/100931
// The router pushes the history entry synchronously inside the originating
// user gesture (instead of after the navigation commits) so Safari
// attributes interaction to the entry and doesn't skip it on Back.
describe('history-sync-push', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('updates the address bar synchronously on link click, before commit', async () => {
    const browser = await next.browser('/')
    const historyLength = await browser.eval('window.history.length')

    await browser.elementById('to-slow').click()

    // The target is slow (2s), so the navigation cannot have committed yet.
    // The address bar must already show the target: the entry was pushed
    // synchronously inside the click gesture.
    expect(await browser.eval('window.location.pathname')).toBe('/slow')
    expect(await browser.eval('window.history.length')).toBe(historyLength + 1)

    // The navigation still completes normally.
    await browser.waitForElementByCss('#slow-content', 10000)
    expect(await browser.eval('window.history.length')).toBe(historyLength + 1)

    // And Back returns to home (no entry was skipped or duplicated).
    await browser.back()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('home')
    })

    await browser.close()
  })

  it('leaves no ghost entry behind when the navigation redirects', async () => {
    const browser = await next.browser('/')
    const historyLength = await browser.eval('window.history.length')

    await browser.elementById('to-redir').click()

    await browser.waitForElementByCss('#slow-content', 10000)
    expect(await browser.eval('window.location.pathname')).toBe('/slow')
    // Exactly one new entry: the optimistic /redir entry must have been
    // repurposed for /slow, not left behind as a ghost.
    expect(await browser.eval('window.history.length')).toBe(historyLength + 1)

    // Back must return home, not to the /redir ghost (which would bounce
    // forward to /slow again).
    await browser.back()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('home')
    })
    expect(await browser.eval('window.location.pathname')).toBe('/')

    await browser.close()
  })
})
