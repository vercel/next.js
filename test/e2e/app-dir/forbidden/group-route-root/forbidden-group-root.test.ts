import { nextTestSetup } from 'e2e-utils'

describe('forbidden-group-root', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  it('should render root not found for group routes if hit 403', async () => {
    const browser = await next.browser('/group-dynamic/123')
    expect(await browser.elementByCss('p').text()).toBe('group-dynamic [id]')

    await browser.loadPage(next.url + '/group-dynamic/403')
    expect(await browser.elementByCss('p').text()).toBe('Forbidden placeholder')
    expect(await browser.elementByCss('h1').text()).toBe('Root layout')
  })
})
