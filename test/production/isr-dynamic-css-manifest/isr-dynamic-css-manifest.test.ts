import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

/**
 * Regression for https://github.com/vercel/next.js/issues/96429
 *
 * After ISR revalidation, Pages Router runtime renders must still consult
 * `dynamic-css-manifest.json` so shared CSS modules loaded via `next/dynamic`
 * are not marked `data-n-p` and subsequently removed on client navigation.
 *
 * This only applies to webpack production builds (Turbopack does not emit /
 * consume this manifest).
 */
;(process.env.IS_WEBPACK_TEST ? describe : describe.skip)(
  'isr-dynamic-css-manifest',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    async function waitForHomeIsr() {
      const initialHtml = await next.render('/')
      const initialNow = initialHtml.match(/id="home-now">(\d+)</)?.[1]
      expect(initialNow).toBeTruthy()

      await retry(async () => {
        const html = await next.render('/')
        const now = html.match(/id="home-now">(\d+)</)?.[1]
        expect(now).toBeTruthy()
        expect(now).not.toBe(initialNow)
      })
    }

    it('should not mark shared dynamic CSS with data-n-p after ISR revalidation', async () => {
      const initialHtml = await next.render('/')
      expect(initialHtml).toMatch(/rel="stylesheet"[^>]*href="[^"]+\.css"/)
      // Fresh build HTML should not tag the shared CSS as page-only.
      expect(initialHtml).not.toMatch(
        /rel="stylesheet"[^>]*href="[^"]+\.css"[^>]*data-n-p=""/
      )

      await waitForHomeIsr()

      const revalidatedHtml = await next.render('/')
      // After ISR, runtime render must still omit data-n-p for CSS present in
      // dynamic-css-manifest.json.
      expect(revalidatedHtml).not.toMatch(
        /rel="stylesheet"[^>]*href="[^"]+\.css"[^>]*data-n-p=""/
      )
    })

    it('should keep CSS module styles after client navigation following ISR revalidation', async () => {
      await waitForHomeIsr()

      const browser = await next.browser('/')
      await browser.elementByCss('#to-second').click()

      await retry(async () => {
        expect(await browser.elementByCss('#styled-box').text()).toBe(
          'Styled box'
        )
        const bg = await browser.eval(
          `window.getComputedStyle(document.querySelector('#styled-box')).backgroundColor`
        )
        expect(bg).toBe('rgb(47, 111, 79)')
      })
    })
  }
)
