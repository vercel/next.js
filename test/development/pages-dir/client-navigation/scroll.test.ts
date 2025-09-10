/* eslint-env jest */

import { check } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation scroll', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  describe('resets scroll at the correct time', () => {
    it('should reset scroll before the new page runs its lifecycles (<Link />)', async () => {
      const browser = await next.browser('/nav/long-page-to-snap-scroll')

      // Scrolls to item 400 on the page
      await browser
        .waitForElementByCss('#long-page-to-snap-scroll')
        .elementByCss('#scroll-to-item-400')
        .click()

      const scrollPosition = await browser.eval('window.pageYOffset')
      expect(scrollPosition).toBe(7208)

      // Go to snap scroll page
      await browser
        .elementByCss('#goto-snap-scroll-position')
        .click()
        .waitForElementByCss('#scroll-pos-y')

      const snappedScrollPosition = await browser.eval(
        'document.getElementById("scroll-pos-y").innerText'
      )
      expect(snappedScrollPosition).toBe('0')
    })

    it('should reset scroll before the new page runs its lifecycles (Router#push)', async () => {
      const browser = await next.browser('/nav/long-page-to-snap-scroll')

      // Scrolls to item 400 on the page
      await browser
        .waitForElementByCss('#long-page-to-snap-scroll')
        .elementByCss('#scroll-to-item-400')
        .click()

      const scrollPosition = await browser.eval('window.pageYOffset')
      expect(scrollPosition).toBe(7208)

      // Go to snap scroll page
      await browser
        .elementByCss('#goto-snap-scroll-position-imperative')
        .click()
        .waitForElementByCss('#scroll-pos-y')

      const snappedScrollPosition = await browser.eval(
        'document.getElementById("scroll-pos-y").innerText'
      )
      expect(snappedScrollPosition).toBe('0')
    })

    it('should intentionally not reset scroll before the new page runs its lifecycles (Router#push)', async () => {
      const browser = await next.browser('/nav/long-page-to-snap-scroll')

      // Scrolls to item 400 on the page
      await browser
        .waitForElementByCss('#long-page-to-snap-scroll')
        .elementByCss('#scroll-to-item-400')
        .click()

      const scrollPosition = await browser.eval('window.pageYOffset')
      expect(scrollPosition).toBe(7208)

      // Go to snap scroll page
      await browser
        .elementByCss('#goto-snap-scroll-position-imperative-noscroll')
        .click()
        .waitForElementByCss('#scroll-pos-y')

      const snappedScrollPosition = await browser.eval(
        'document.getElementById("scroll-pos-y").innerText'
      )
      expect(snappedScrollPosition).not.toBe('0')
      expect(Number(snappedScrollPosition)).toBeGreaterThanOrEqual(7208)
    })
  })

  it('should scroll to top when the scroll option is set to true', async () => {
    const browser = await next.browser('/nav/shallow-routing')
    await browser.eval(() =>
      document.querySelector('#increaseWithScroll').scrollIntoView()
    )
    const scrollPosition = await browser.eval('window.pageYOffset')

    expect(scrollPosition).toBeGreaterThan(3000)

    await browser.elementByCss('#increaseWithScroll').click()
    await check(async () => {
      const newScrollPosition = await browser.eval('window.pageYOffset')
      return newScrollPosition === 0 ? 'success' : 'fail'
    }, 'success')
  })
})
