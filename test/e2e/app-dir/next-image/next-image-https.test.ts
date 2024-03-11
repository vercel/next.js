import { createNextDescribe } from '../../../lib/e2e-utils'

createNextDescribe(
  'app dir - next-image (with https)',
  {
    files: __dirname,
    skipDeployment: true,
    startCommand: `yarn next dev --experimental-https`,
  },
  ({ next }) => {
    if (!process.env.CI) {
      console.warn('only runs on CI as it requires administrator privileges')
      it('only runs on CI as it requires administrator privileges', () => {})
      return
    }

    it('loads images without any errors', async () => {
      let failCount = 0
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          page.on('response', (response) => {
            const url = response.url()
            if (!url.includes('/_next/image')) return

            const status = response.status()

            console.log(`URL: ${url} Status: ${status}`)

            if (!response.ok()) {
              console.log(`Request failed: ${url}`)
              failCount++
            }
          })
        },
      })
      const image = browser.elementByCss('#app-page')
      const src = await image.getAttribute('src')

      if (process.env.TURBOPACK) {
        expect(src).toMatchInlineSnapshot(
          `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.308c602d.png&w=828&q=90"`
        )
      } else {
        expect(src).toMatchInlineSnapshot(
          `"/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Ftest.3f1a293b.png&w=828&q=90"`
        )
      }

      expect(failCount).toBe(0)
    })
  }
)
