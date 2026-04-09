import { nextTestSetup } from 'e2e-utils'

describe('global-not-found - metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render metadata of global-not-found for 404', async () => {
    // assert SSR metadata
    const $ = await next.render$('/does-not-exist')
    expect($('title').text()).toBe('global-not-found')
    expect($('meta[name="description"]').attr('content')).toBe(
      'global-not-found description'
    )
    // pick up static icon svg
    expect($('link[rel="icon"]').attr('type')).toBe('image/svg+xml')

    // assert hydrated metadata
    const browser = await next.browser('/does-not-exist')
    const title = await browser.elementByCss('title')
    const description = await browser.elementByCss('meta[name="description"]')
    expect(await title.text()).toBe('global-not-found')
    expect(await description.getAttribute('content')).toBe(
      'global-not-found description'
    )
    // pick up static icon svg
    const icon = await browser.elementByCss('link[rel="icon"]', {
      state: 'attached',
    })
    expect(await icon.getAttribute('type')).toBe('image/svg+xml')
  })
})
