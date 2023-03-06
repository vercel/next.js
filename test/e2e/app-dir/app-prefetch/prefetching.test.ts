import { createNextDescribe } from 'e2e-utils'
import { check, waitFor } from 'next-test-utils'

createNextDescribe(
  'app dir prefetching',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    // TODO: re-enable for dev after https://vercel.slack.com/archives/C035J346QQL/p1663822388387959 is resolved (Sep 22nd 2022)
    if (isNextDev) {
      it('should skip next dev for now', () => {})
      return
    }

    it('should show layout eagerly when prefetched with loading one level down', async () => {
      const browser = await next.browser('/')
      // Ensure the page is prefetched
      await waitFor(1000)

      const before = Date.now()
      await browser
        .elementByCss('#to-dashboard')
        .click()
        .waitForElementByCss('#dashboard-layout')
      const after = Date.now()
      const timeToComplete = after - before

      expect(timeToComplete < 1000).toBe(true)

      expect(await browser.elementByCss('#dashboard-layout').text()).toBe(
        'Dashboard Hello World'
      )

      await browser.waitForElementByCss('#dashboard-page')

      expect(await browser.waitForElementByCss('#dashboard-page').text()).toBe(
        'Welcome to the dashboard'
      )
    })

    it('should not have prefetch error for static path', async () => {
      const browser = await next.browser('/')
      await browser.eval('window.nd.router.prefetch("/dashboard/123")')
      await waitFor(3000)
      await browser.eval('window.nd.router.push("/dashboard/123")')
      expect(next.cliOutput).not.toContain('ReferenceError')
      expect(next.cliOutput).not.toContain('is not defined')
    })

    it('should not fetch again when a static page was prefetched', async () => {
      const browser = await next.browser('/404')
      let requests: string[] = []

      browser.on('request', (req) => {
        requests.push(new URL(req.url()).pathname)
      })
      await browser.eval('location.href = "/"')

      await browser.eval('window.nd.router.prefetch("/static-page")')
      await check(() => {
        return requests.some((req) => req.includes('static-page'))
          ? 'success'
          : JSON.stringify(requests)
      }, 'success')

      await browser
        .elementByCss('#to-static-page')
        .click()
        .waitForElementByCss('#static-page')

      expect(
        requests.filter((request) => request === '/static-page').length
      ).toBe(1)
    })

    it('should not prefetch for a bot user agent', async () => {
      const browser = await next.browser('/404')
      let requests: string[] = []

      browser.on('request', (req) => {
        requests.push(new URL(req.url()).pathname)
      })
      await browser.eval(
        `location.href = "/?useragent=${encodeURIComponent(
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/W.X.Y.Z Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        )}"`
      )

      await browser.elementByCss('#to-static-page').moveTo()

      // check five times to ensure prefetch didn't occur
      for (let i = 0; i < 5; i++) {
        await waitFor(500)
        expect(
          requests.filter((request) => request === '/static-page').length
        ).toBe(0)
      }
    })

    it('should navigate when prefetch is false', async () => {
      const browser = await next.browser('/prefetch-false/initial')
      await browser
        .elementByCss('#to-prefetch-false-result')
        .click()
        .waitForElementByCss('#prefetch-false-page-result')

      expect(
        await browser.elementByCss('#prefetch-false-page-result').text()
      ).toBe('Result page')
    })
  }
)
