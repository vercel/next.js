import { nextTestSetup } from 'e2e-utils'

describe('parallel-routes-duplicate-rendering', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render parallel routes that repeat slot content', async () => {
    const browser = await next.browser('/')

    expect((await browser.elementsByCss('.nav')).length).toBe(2)
  })

  it('should still be able to handle not-found pages', async () => {
    const browser = await next.browser('/non-existent')
    expect((await browser.elementsByCss('.nav')).length).toBe(2)

    expect(await browser.elementByCss('body').text()).toContain(
      'Could not find requested resource'
    )
  })

  it('should still be able to handle error pages', async () => {
    const browser = await next.browser('/error-page')
    expect((await browser.elementsByCss('.nav')).length).toBe(2)

    expect(await browser.elementByCss('body').text()).toContain(
      'Something went wrong!'
    )
  })
})
