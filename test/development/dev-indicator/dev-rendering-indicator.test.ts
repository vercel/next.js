/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const installCheckVisible = (browser) => {
  return browser.eval(`(function() {
      window.checkInterval = setInterval(function() {
      const root = document.querySelector('nextjs-portal').shadowRoot;
      const statusElement = root.querySelector('[data-indicator-status]')
      const badge = root.querySelector('[data-next-badge]')
      const status = badge ? badge.getAttribute('data-status') : null

      // Check if we're showing any status (rendering, compiling, etc.)
      window.showedBuilder = window.showedBuilder || (
        statusElement !== null || (status && status !== 'none')
      )
      if (window.showedBuilder) clearInterval(window.checkInterval)
    }, 5)
  })()`)
}

describe('Dev Rendering Indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('Shows build indicator when page is built from modifying', async () => {
    // Ensure both pages are built first so that we don't confuse it with build indicator
    await Promise.all([
      next.fetch('/app/rendering/a'),
      next.fetch('/app/rendering/b'),
    ])
    const browser = await next.browser('/app/rendering/a')
    await installCheckVisible(browser)
    await browser.eval('window.showedBuilder = false')

    await browser.elementByCss('[href="/app/rendering/b"]').click()
    await retry(async () => {
      await browser.elementByCss('[href="/app/rendering/a"]')
    })

    const showedRenderingIndicator = await browser.eval('window.showedBuilder')
    expect({ showedRenderingIndicator }).toEqual({
      showedRenderingIndicator: true,
    })
  })
})
