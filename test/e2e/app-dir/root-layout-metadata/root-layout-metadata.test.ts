import { nextTestSetup } from 'e2e-utils'

describe('root-layout-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page metadata in SSR', async () => {
    const $one = await next.render$('/en/one')
    expect($one('title').text()).toBe('Page 1')
    expect($one('meta[name="description"]').attr('content')).toBe(
      'Page 1 Description'
    )

    const $two = await next.render$('/en/two')
    expect($two('title').text()).toBe('Page 2')
    expect($two('meta[name="description"]').attr('content')).toBe(
      'Page 2 Description'
    )
  })

  it('should render the page metadata in browser', async () => {
    const browserOne = await next.browser('/en/one')
    expect(await browserOne.elementByCss('title').text()).toBe('Page 1')
    expect(
      await browserOne
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Page 1 Description')

    const browserTwo = await next.browser('/en/two')
    expect(await browserTwo.elementByCss('title').text()).toBe('Page 2')
    expect(
      await browserTwo
        .elementByCss('meta[name="description"]')
        .getAttribute('content')
    ).toBe('Page 2 Description')
  })
})
