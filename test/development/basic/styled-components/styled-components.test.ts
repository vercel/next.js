import webdriver from 'next-webdriver'
import { createNextDescribe } from 'e2e-utils'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

createNextDescribe(
  'styled-components SWC transform',
  {
    files: __dirname,
    dependencies: {
      'styled-components': '5.3.3',
    },
  },
  ({ next }) => {
    async function matchLogs$(browser) {
      let foundLog = false

      const browserLogs = await browser.log('browser')

      browserLogs.forEach((log) => {
        if (log.message.includes('Warning: Prop `%s` did not match.')) {
          foundLog = true
        }
      })
      return foundLog
    }

    it('should not have hydration mismatch with styled-components transform enabled', async () => {
      let browser
      try {
        browser = await webdriver(next.url, '/')

        // Compile /_error
        await fetchViaHTTP(next.url, '/404')

        // Try 4 times to be sure there is no mismatch
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
        await browser.refresh()
        expect(await matchLogs$(browser)).toBe(false)
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should render the page with correct styles', async () => {
      const browser = await webdriver(next.url, '/')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#btn')).color`
        )
      ).toBe('rgb(255, 255, 255)')
      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#wrap-div')).color`
        )
      ).toBe('rgb(0, 0, 0)')
    })

    it('should enable the display name transform by default', async () => {
      // make sure the index chunk gets generated
      const html = await next.render('/')
      expect(html).toContain('pages__Button')
    })

    it('should contain styles in initial HTML', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toContain('background:transparent')
      expect(html).toContain('color:white')
    })

    it('should only render once on the server per request', async () => {
      const outputs = []
      next.on('stdout', (args) => {
        outputs.push(args)
      })
      await renderViaHTTP(next.url, '/')
      expect(
        outputs.filter((output) => output.trim() === '__render__').length
      ).toBe(1)
    })
  }
)
