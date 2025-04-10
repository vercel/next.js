import { nextTestSetup } from 'e2e-utils'

describe('middleware-rewrite-dynamic-params', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have correct dynamic params after middleware rewrites', async () => {
    // should be rewritten with /en
    const browser = await next.browser('/')
    expect(await browser.elementByCss('a').text()).toBe('Go to /1/2')

    // navigate to /1/2
    await browser.elementByCss('a').click()
    expect(await browser.url()).toEndWith(next.appPort + '/1/2')

    // should be rewritten with /en/1/2 with correct params
    expect(await browser.elementByCss('p').text()).toBe(
      '{"locale":"en","rest":["1","2"]}'
    )

    // reloading the page should have the same params
    await browser.refresh()
    expect(await browser.elementByCss('p').text()).toBe(
      '{"locale":"en","rest":["1","2"]}'
    )
  })
})
