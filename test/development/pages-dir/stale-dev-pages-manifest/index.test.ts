/* eslint-env jest */

import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox } from 'next-test-utils'

describe('stale dev pages manifest during rewrite adoption', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
  })

  it('should adopt a rewritten route that becomes available after boot', async () => {
    const browser = await next.browser('/docs/start')

    try {
      // 1. Materialize the rewritten target after the tab has already booted.
      const materializeButton = await browser.elementByCss(
        '#materialize-example'
      )
      await materializeButton.click()

      // 2. Trigger the client-side navigation through the public route.
      await browser.elementByCss('#go-to-example').click()

      // 3. The rewritten page should render while the browser stays on the public URL.
      const rewrittenRoutePage = await browser.elementByCss(
        '#rewritten-route-page'
      )
      expect(await rewrittenRoutePage.text()).toBe('Rewritten route page')

      const publicPathname = await browser.eval(`window.location.pathname`)
      expect(publicPathname).toBe('/docs/example')

      const rewrittenRouteComponent = await browser.elementByCss(
        '#rewritten-route-component'
      )
      expect(await rewrittenRouteComponent.text()).toBe(
        'Loaded rewritten route component'
      )

      // 4. The rewritten navigation should complete without surfacing a dev error overlay.
      await waitForNoRedbox(browser)
    } finally {
      await browser.close()
    }
  })
})
