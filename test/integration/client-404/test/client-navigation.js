/* eslint-env jest */
/* global browser */
import { getElementText } from 'puppet-utils'

export default (context) => {
  describe('Client Navigation 404', () => {
    describe('should show 404 upon client replacestate', () => {
      it('should navigate the page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/asd'))

        await page.waitFor('#errorStatusCode')
        const serverCode = await getElementText(page, '#errorStatusCode')
        await expect(page).toClick('#errorGoHome')
        await page.waitFor('#hellom8')
        await page.goBack()

        await page.waitFor('#errorStatusCode')
        const clientCode = await getElementText(page, '#errorStatusCode')

        expect({ serverCode, clientCode }).toMatchObject({
          serverCode: '404',
          clientCode: '404'
        })
        await page.close()
      })
    })
  })
}
