import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'custom-app-hmr',
  {
    files: __dirname,
  },
  ({ next }) => {
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

      await check(async () => {
        const pText = await browser.elementByCss('h1').text()
        expect(pText).toBe('hmr text changed')

        // Should keep the value on window, which indicates there's no full reload
        const hmrConstantValue = await browser.eval('window.hmrConstantValue')
        expect(hmrConstantValue).toBe('should-not-change')

        return 'success'
      }, 'success')

      await next.patchFile(customAppFilePath, customAppContent)
      await check(async () => {
        const pText = await browser.elementByCss('h1').text()
        expect(pText).toBe('hmr text origin')

        // Should keep the value on window, which indicates there's no full reload
        const hmrConstantValue = await browser.eval('window.hmrConstantValue')
        expect(hmrConstantValue).toBe('should-not-change')

        return 'success'
      }, 'success')
    })
  }
)
