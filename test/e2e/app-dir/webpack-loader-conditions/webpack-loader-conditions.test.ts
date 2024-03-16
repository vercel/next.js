import { nextTestSetup } from 'e2e-utils'

describe('webpack-loader-conditions', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (!isTurbopack) {
    it('should only run the test in turbopack', () => {})
    return
  }

  it('should render correctly on server site', async () => {
    const res = await next.fetch('/')
    const html = (await res.text()).replaceAll(/<!-- -->/g, '')
    expect(html).toContain(`server: {&quot;default&quot;:true}`)
    expect(html).toContain(`client: {&quot;nextSsr&quot;:true}`)
  })

  it('should render correctly on client side', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('body').text()
    expect(text).toContain(`server: ${JSON.stringify({ default: true })}`)
    expect(text).toContain(`client: ${JSON.stringify({ browser: true })}`)
  })
})
