import { nextTestSetup } from 'e2e-utils'
import { getRouteTypeFromDevToolsIndicator, retry } from 'next-test-utils'
import { BrowserInterface } from 'next-webdriver'

describe('prerender indicator', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const isNewDevOverlay =
    process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'true'

  async function hasStaticIndicator(browser: BrowserInterface) {
    if (isNewDevOverlay) {
      const routeType = await getRouteTypeFromDevToolsIndicator(browser)
      console.log({ routeType })
      return routeType === 'Static'
    }

    const staticIndicatorPresent = await browser.eval(() =>
      Boolean(
        document
          .querySelector('nextjs-portal')
          .shadowRoot.querySelector('.nextjs-static-indicator-toast-wrapper')
      )
    )
    return staticIndicatorPresent
  }

  it('should have prerender-indicator by default for static page', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await hasStaticIndicator(browser)).toBe(true)
    })
  })

  it('should hide the indicator when changing to dynamic', async () => {
    const browser = await next.browser('/')
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    try {
      await retry(async () => {
        expect(await hasStaticIndicator(browser)).toBe(false)
      })
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  it('should not have the indicator on dynamic page on load', async () => {
    const origContent = await next.readFile('app/page.tsx')

    await next.patchFile(
      'app/page.tsx',
      origContent.replace('// headers()', 'headers()')
    )

    const browser = await next.browser('/')

    try {
      await retry(async () => {
        expect(await hasStaticIndicator(browser)).toBe(false)
      })
    } finally {
      await next.patchFile('app/page.tsx', origContent)
    }
  })

  // TODO(jiwon): The new UI will always show the route type.
  if (!isNewDevOverlay) {
    it.skip('should not show the indicator if disabled in next.config', async () => {
      await next.stop()

      await next.patchFile(
        'next.config.js',
        `
        module.exports = {
          devIndicators: {
            appIsrStatus: false
          }
        }
      `
      )

      try {
        await next.start()
        const browser = await next.browser('/')
        expect(await hasStaticIndicator(browser)).toBe(false)
      } finally {
        await next.deleteFile('app/page.tsx')
      }
    })
  }

  it('should not have static indicator when using force-dynamic', async () => {
    const browser = await next.browser('/force-dynamic')

    await browser.waitForElementByCss('#ready')

    expect(await hasStaticIndicator(browser)).toBe(false)
  })
})
