import { nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

// This test relies on an experimental webpack feature (lazyCompilation).
describe('next/dynamic lazy compilation', () => {
  if (shouldUseTurbopack()) {
    it('skips in Turbopack tests', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render server value', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/the-server-value/i)
    expect(html).toMatch(/the-second-server-value/i)
  })

  it('should render dynamic server rendered values before hydration', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#before-hydration').text()

    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')
  })

  it('should render dynamic server rendered values on client mount', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#first-render').text()

    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')
  })
})
