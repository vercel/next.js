import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'experimental-https-server',
  {
    files: __dirname,
    startCommand: 'yarn next dev --experimental-https',
  },
  ({ next }) => {
    it('should successfully load the app in app dir', async () => {
      const browser = await next.browser('/1')
      expect(await browser.url()).toInclude('https://')

      expect(await browser.waitForElementByCss('#app').text()).toBe(
        'Hello from App'
      )
    })

    it('should successfully load the app in pages dir', async () => {
      const browser = await next.browser('/2')
      expect(await browser.url()).toInclude('https://')

      expect(await browser.waitForElementByCss('#app').text()).toBe(
        'Hello from Pages'
      )
    })
  }
)
