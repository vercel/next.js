/* eslint-env jest */
/* global browser */

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('should load inline script by hash', async () => {
      const errors = []
      const page = await browser.newPage()

      page.on('error', err => {
        errors.push(err)
      })
      await page.goto(context.server.getURL('/?withCSP=hash'))
      expect(errors.length).toBe(0)
      await page.close()
    })

    it('should load inline script by nonce', async () => {
      const errors = []
      const page = await browser.newPage()

      page.on('error', err => {
        errors.push(err)
      })
      await page.goto(context.server.getURL('/?withCSP=nonce'))
      expect(errors.length).toBe(0)
      await page.close()
    })
  })
}
