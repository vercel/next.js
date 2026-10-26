import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('nested server action returned from a client-imported action', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('keeps the returned server action callable', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      await browser.elementById('get-inner').click()
    })
    await retry(async () => {
      expect(await browser.elementById('status').text()).toBe('stored')
    })

    await retry(async () => {
      await browser.elementById('call-inner').click()
    })
    await retry(async () => {
      expect(await browser.elementById('status').text()).toBe('captured:client')
    })
  })
})
