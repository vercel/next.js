import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - not-found - before interactive scripts loaded',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should include before interactive scripts defined in RootLayout', async () => {
      const browser = await next.browser('/non-existent')

      const scriptContent = await browser.eval(
        'window.__BEFORE_INTERACTIVE_CONTENT'
      )

      expect(scriptContent).toBe('loaded')
    })
  }
)
