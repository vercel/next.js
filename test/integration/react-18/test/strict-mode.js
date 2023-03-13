/* eslint-env jest */

import webdriver from 'next-webdriver'

export default (context) => {
  describe('<RouteAnnouncer />', () => {
    it('should not have the initial route announced', async () => {
      const browser = await webdriver(context.appPort, '/')
      const title = await browser
        .waitForElementByCss('#__next-route-announcer__')
        .text()

      expect(title).toBe('')
    })
  })
}
