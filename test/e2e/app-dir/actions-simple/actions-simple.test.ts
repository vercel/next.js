import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('actions-simple', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should work with server actions passed to client components', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should work with server actions imported from client components', async () => {
    const browser = await next.browser('/client')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })
})
