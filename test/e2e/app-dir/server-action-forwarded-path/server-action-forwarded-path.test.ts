import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-action-forwarded-path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('forwards an action to a dynamic route through a strict front end', async () => {
    const browser = await next.browser('/items/1/edit')
    await browser.elementByCss('#leave-editor').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Item')
    })
    await browser.elementByCss('#save-draft').click()
    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('1:hello')
    })
  })
})
