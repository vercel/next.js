import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('popstate-null-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should hard navigate when history.state is null on popstate', async () => {
    const browser = await next.browser('/')

    // Verify the initial page is rendered
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/')
    })

    // Navigate to /other via client-side navigation so the router tree updates
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/other')
    })

    // Push a history entry with null state for '/', bypassing the Next.js
    // patched pushState (which copies internal state). The patch is on the
    // instance, so calling via the prototype bypasses it.
    // History stack: [('/', nextjs), ('/other', nextjs), ('/', null), ('/', null)]
    await browser.eval(
      `History.prototype.pushState.call(window.history, null, '', '/')`
    )

    await browser.eval(
      `History.prototype.pushState.call(window.history, null, '', '/')`
    )

    // Validate the push worked: URL changed and history.state is null
    expect(await browser.eval('window.location.pathname')).toBe('/')
    expect(await browser.eval('window.history.state')).toBe(null)

    // Now go back — this triggers popstate with event.state === null
    // (the state from the ('/', null) entry).
    // Without the fix the router would do nothing, leaving pathname as '/other'.
    // With the fix a hard navigation (reload) occurs, loading '/' fresh.
    await browser.back()

    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/')
    })
  })

  it('should handle back navigation to a hash change without full reload', async () => {
    const browser = await next.browser('/')

    // Verify the initial page is rendered
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/')
    })

    // Click a regular anchor link. The browser pushes a new history entry
    // with null state for the hash URL.
    // History stack: [('/', nextjs), ('/#hash', null)]
    await browser.elementByCss('#hash-link').click()

    await retry(async () => {
      expect(await browser.url()).toContain('#hash')
    })

    // Navigate to /other via Link so there's a forward entry.
    // History stack: [('/', nextjs), ('/#hash', null), ('/other', nextjs)]
    await browser.elementByCss('#to-other').click()
    await retry(async () => {
      expect(await browser.elementByCss('#pathname').text()).toBe('/other')
    })

    // Go back — popstate fires with the hash entry's state (null).
    // Since only the hash changed, the page should remain functional
    // without losing client-side state.
    await browser.back()

    await retry(async () => {
      expect(await browser.url()).toContain('#hash')
      expect(await browser.elementByCss('#pathname').text()).toBe('/')
    })
  })
})
