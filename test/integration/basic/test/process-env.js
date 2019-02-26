/* eslint-env jest */
/* global browser */

export default (context) => {
  describe('process.env', () => {
    it('should set process.env.NODE_ENV in development', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/process-env'))
      await expect(page).toMatchElement('#node-env', { text: 'development' })
      await page.close()
    })
  })
}
