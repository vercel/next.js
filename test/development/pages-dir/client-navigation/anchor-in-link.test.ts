/* eslint-env jest */

import { waitFor } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client Navigation', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  describe('with <a/> tag inside the <Link />', () => {
    it('should navigate the page', async () => {
      const browser = await next.browser('/nav/about')
      const text = await browser
        .elementByCss('#home-link')
        .click()
        .waitForElementByCss('.nav-home')
        .elementByCss('p')
        .text()

      expect(text).toBe('This is the home.')
      await browser.close()
    })

    it('should not navigate if the <a/> tag has a target', async () => {
      const browser = await next.browser('/nav')

      await browser
        .elementByCss('#increase')
        .click()
        .elementByCss('#target-link')
        .click()

      await waitFor(1000)

      const counterText = await browser.elementByCss('#counter').text()

      expect(counterText).toBe('Counter: 1')
      await browser.close()
    })

    it('should not navigate if the click-event is modified', async () => {
      const browser = await next.browser('/nav')

      await browser.elementByCss('#increase').click()

      const key = process.platform === 'darwin' ? 'Meta' : 'Control'

      await browser.keydown(key)

      await browser.elementByCss('#in-svg-link').click()

      await browser.keyup(key)
      await waitFor(1000)

      const counterText = await browser.elementByCss('#counter').text()

      expect(counterText).toBe('Counter: 1')
      await browser.close()
    })

    it('should not reload when link in svg is clicked', async () => {
      const browser = await next.browser('/nav')
      await browser.eval('window.hello = true')
      await browser
        .elementByCss('#in-svg-link')
        .click()
        .waitForElementByCss('.nav-about')

      expect(await browser.eval('window.hello')).toBe(true)
      await browser.close()
    })
  })
})
