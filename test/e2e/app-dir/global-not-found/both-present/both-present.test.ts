import { nextTestSetup } from 'e2e-utils'

describe('global-not-found - both-present', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render global-not-found for 404 routes', async () => {
    const $ = await next.render$('/does-not-exist')
    expect($('html').attr('data-global-not-found')).toBe('true')
    expect($('#global-error-title').text()).toBe('global-not-found')

    const browser = await next.browser('/does-not-exist')
    expect(await browser.elementByCss('#global-error-title').text()).toBe(
      'global-not-found'
    )
    expect(
      await browser.elementByCss('html').getAttribute('data-global-not-found')
    ).toBe('true')
  })

  it('should render not-found boundary when calling notFound() in a page', async () => {
    const browser = await next.browser('/call-not-found')
    expect(await browser.elementByCss('#not-found-boundary').text()).toBe(
      'not-found.js'
    )
    expect(
      await browser.elementByCss('html').getAttribute('data-global-not-found')
    ).toBeNull()
  })
})
