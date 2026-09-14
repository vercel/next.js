import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-action-headers-redirect', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('redirects after a server action that reads headers()', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('#submit').click()

    await retry(async () => {
      expect(await browser.url()).toEndWith('/destination')
      expect(await browser.elementByCss('#destination').text()).toBe('Success!')
    })
  })
})
