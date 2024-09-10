import { nextTestSetup } from 'e2e-utils'
import { retry } from 'e2e-utils'

describe('app-dir - dynamic-action-return-component', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to pass action to component and being called internally', async () => {
    const { browser } = await next.browser('/')
    
    await retry(() => browser.elementByCss('button').text(), 'default')
    expect(await browser.elementByCss('button').click())
    await retry(() => browser.elementByCss('button').text(), 'foo')
  })
})
