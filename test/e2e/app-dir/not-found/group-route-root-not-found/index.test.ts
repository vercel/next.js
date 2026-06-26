import { nextTestSetup } from 'e2e-utils'

describe('app dir - group routes with root not-found', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render default 404 with root layout for non-existent page', async () => {
    const browser = await next.browser('/non-existent')
    expect(await browser.elementByCss('p').text()).toBe('Not found placeholder')
    expect(await browser.elementByCss('h1').text()).toBe('Root layout')
  })

  it('should render root not found for group routes if hit 404', async () => {
    const browser = await next.browser('/group-dynamic/123')
    expect(await browser.elementByCss('p').text()).toBe('group-dynamic [id]')

    await browser.loadPage(next.url + '/group-dynamic/404')
    expect(await browser.elementByCss('p').text()).toBe('Not found placeholder')
    expect(await browser.elementByCss('h1').text()).toBe('Root layout')
  })
})
