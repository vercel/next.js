import { nextTestSetup } from 'e2e-utils'

describe('prerender-encoding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond with the prerendered page correctly', async () => {
    const browser = await next.browser('/sticks%20%26%20stones')
    expect(await browser.elementByCss('div').text()).toBe(
      'params.id is sticks%20%26%20stones'
    )
  })
})
