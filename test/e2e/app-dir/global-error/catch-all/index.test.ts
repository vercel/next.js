import { nextTestSetup } from 'e2e-utils'

describe('app dir - global error - with catch-all route', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should render catch-all route correctly', async () => {
    expect(await next.render('/en/foo')).toContain('catch-all page')
  })

  it('should render 404 page correctly', async () => {
    expect(await next.render('/en')).toContain('This page could not be found.')
  })

  it('should render global error correctly', async () => {
    const browser = await next.browser('/en/error')

    const text = await browser.elementByCss('#global-error').text()
    expect(text).toMatchInlineSnapshot(`"global-error"`)
  })
})
