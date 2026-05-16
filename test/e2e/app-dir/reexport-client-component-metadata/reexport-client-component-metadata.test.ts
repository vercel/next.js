import { nextTestSetup } from 'e2e-utils'

describe('app-dir - reexport-client-component-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page metadata if override', async () => {
    const $ = await next.render$('/override')
    expect($('title').text()).toBe('Page 1')
    expect($('meta[name="description"]').attr('content')).toBe(
      'Page 1 Description'
    )

    const browser = await next.browser('/override')
    expect(await browser.elementByCss('title').text()).toBe('Page 1')
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Page 1 Description')
  })

  it('should render the layout metadata if not override', async () => {
    const $ = await next.render$('/no-override')
    expect($('title').text()).toBe('Root Layout')
    expect($('meta[name="description"]').attr('content')).toBe(
      'Root Description'
    )

    const browser = await next.browser('/no-override')
    expect(await browser.elementByCss('title').text()).toBe('Root Layout')
    expect(
      await browser
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Root Description')
  })
})
