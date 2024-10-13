import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('temporary-references', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return the same object that was sent to the action', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('initial')

    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('identical')
    })
  })
})
