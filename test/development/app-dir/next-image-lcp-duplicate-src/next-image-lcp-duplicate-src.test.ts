import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('next/image LCP warning with a duplicated src', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it.each(['eager', 'preload', 'priority', 'lazy'])(
    'checks the painted %s image instead of its duplicate',
    async (loading) => {
      const browser = await next.browser(`/${loading}`, {
        async beforePageLoad(page) {
          await page.route(/\/_next\/image\?/, async (route) => {
            // Deliver the image only after both copies have registered their
            // metadata, without relying on a fixed image-response delay.
            await page.waitForSelector('#images[data-hydrated="true"]')
            await route.fulfill({
              path: join(__dirname, 'public/hero.jpg'),
              contentType: 'image/jpeg',
            })
          })
        },
      })

      const lcp = await browser.eval(() => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const image = (
                entry as PerformanceEntry & {
                  element: HTMLImageElement | null
                }
              ).element
              if (image?.id === 'hero') {
                observer.disconnect()
                resolve({
                  loading: image.getAttribute('loading'),
                  sameSrc:
                    image.src ===
                    (document.getElementById('duplicate') as HTMLImageElement)
                      .src,
                })
              }
            }
          })
          observer.observe({ type: 'largest-contentful-paint', buffered: true })
        })
      })

      expect(lcp).toEqual({
        loading: ['eager', 'lazy'].includes(loading) ? loading : null,
        sameSrc: true,
      })
      const warnings = (await browser.log())
        .map((log) => log.message)
        .join('\n')
      const warning = /was detected as the Largest Contentful Paint \(LCP\)/
      if (loading === 'lazy') {
        expect(warnings).toMatch(warning)
      } else {
        expect(warnings).not.toMatch(warning)
      }
    }
  )
})
