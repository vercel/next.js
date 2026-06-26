import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('dynamic-suspense-bailout', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should trigger the parent suspense boundary when loading: undefined is passed', async () => {
    const $ = await next.render$('/')
    expect($('#root-fallback').text()).toBe('Root Loading...')

    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#dynamic-client').text()).toBe(
        'Dynamic Client Content'
      )
    })
  })
})
