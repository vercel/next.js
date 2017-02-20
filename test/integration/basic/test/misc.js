/* global describe, test, expect */
import webdriver from 'next-webdriver'

export default function (context) {
  describe('Misc', () => {
    test('finishes response', async () => {
      const res = {
        finished: false,
        end () {
          this.finished = true
        }
      }
      const html = await context.app.renderToHTML({}, res, '/finish-response', {})
      expect(html).toBeFalsy()
    })

    test('should allow to persist while force reload', async () => {
      const browser = await webdriver(context.appPort, '/force-reload')
      const countText = await browser
        .elementByCss('#increase').click()
        .elementByCss('#increase').click()
        .elementByCss('#counter').text()

      expect(countText).toBe('Counter: 2')

      await browser.elementByCss('#reload').click()

      const newCountText = await browser.elementByCss('#counter').text()
      expect(newCountText).toBe(countText)

      await browser.close()
    })
  })
}
