import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('service-worker-guard', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should run the navigator.serviceWorker check when service workers are unsupported', async () => {
    const browser = await next.browser('/', {
      async beforePageLoad(page) {
        await page.addInitScript(() => {
          Reflect.deleteProperty(Navigator.prototype, 'serviceWorker')
        })
      },
    })

    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('unsupported')
    })
  })

  it('should detect service worker support', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('supported')
    })
  })
})
