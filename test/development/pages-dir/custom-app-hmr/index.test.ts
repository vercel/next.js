import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('custom-app-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should not do full reload when simply editing _app.js', async () => {
    const customAppFilePath = 'pages/_app.js'
    const browser = await next.browser('/')
    await browser.eval('window.hmrConstantValue = "should-not-change"')

    const customAppContent = await next.readFile(customAppFilePath)
    const newCustomAppContent = customAppContent.replace(
      'hmr text origin',
      'hmr text changed'
    )
    await next.patchFile(customAppFilePath, newCustomAppContent)

    await retry(async () => {
      const pText = await browser.elementByCss('h1').text()
      expect(pText).toBe('hmr text changed')

      // Should keep the value on window, which indicates there's no full reload
      const hmrConstantValue = await browser.eval('window.hmrConstantValue')
      expect(hmrConstantValue).toBe('should-not-change')
    })

    await next.patchFile(customAppFilePath, customAppContent)
    await retry(async () => {
      const pText = await browser.elementByCss('h1').text()
      expect(pText).toBe('hmr text origin')

      // Should keep the value on window, which indicates there's no full reload
      const hmrConstantValue = await browser.eval('window.hmrConstantValue')
      expect(hmrConstantValue).toBe('should-not-change')
    })
  })
})
