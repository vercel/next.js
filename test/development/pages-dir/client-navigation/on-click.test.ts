/* eslint-env jest */

import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Client navigation with onClick action', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should reload the page and perform additional action', async () => {
    const browser = await next.browser('/nav/on-click')
    const defaultCountQuery = await browser.elementByCss('#query-count').text()
    const defaultCountState = await browser.elementByCss('#state-count').text()
    expect(defaultCountQuery).toBe('QUERY COUNT: 0')
    expect(defaultCountState).toBe('STATE COUNT: 0')

    await browser.elementByCss('#on-click-link').click()

    await retry(async () => {
      const countQueryAfterClicked = await browser
        .elementByCss('#query-count')
        .text()
      const countStateAfterClicked = await browser
        .elementByCss('#state-count')
        .text()
      expect(countQueryAfterClicked).toBe('QUERY COUNT: 1')
      expect(countStateAfterClicked).toBe('STATE COUNT: 1')
    })
  })

  it('should not reload if default was prevented', async () => {
    const browser = await next.browser('/nav/on-click')
    const defaultCountQuery = await browser.elementByCss('#query-count').text()
    const defaultCountState = await browser.elementByCss('#state-count').text()
    expect(defaultCountQuery).toBe('QUERY COUNT: 0')
    expect(defaultCountState).toBe('STATE COUNT: 0')

    await browser.elementByCss('#on-click-link-prevent-default').click()

    await retry(async () => {
      const countQueryAfterClicked = await browser
        .elementByCss('#query-count')
        .text()
      const countStateAfterClicked = await browser
        .elementByCss('#state-count')
        .text()
      expect(countQueryAfterClicked).toBe('QUERY COUNT: 0')
      expect(countStateAfterClicked).toBe('STATE COUNT: 1')
    })

    await browser.elementByCss('#on-click-link').click()

    await retry(async () => {
      const countQueryAfterClickedAgain = await browser
        .elementByCss('#query-count')
        .text()
      const countStateAfterClickedAgain = await browser
        .elementByCss('#state-count')
        .text()
      expect(countQueryAfterClickedAgain).toBe('QUERY COUNT: 1')
      expect(countStateAfterClickedAgain).toBe('STATE COUNT: 2')
    })
  })

  it('should always replace the state and perform additional action', async () => {
    const browser = await next.browser('/nav')

    await browser.elementByCss('#on-click-link').click()

    await retry(async () => {
      const defaultCountQuery = await browser
        .elementByCss('#query-count')
        .text()
      expect(defaultCountQuery).toBe('QUERY COUNT: 1')
    })

    await browser.elementByCss('#on-click-link').click()

    await retry(async () => {
      const countQueryAfterClicked = await browser
        .elementByCss('#query-count')
        .text()
      const countStateAfterClicked = await browser
        .elementByCss('#state-count')
        .text()
      expect(countQueryAfterClicked).toBe('QUERY COUNT: 2')
      expect(countStateAfterClicked).toBe('STATE COUNT: 1')
    })

    // Since we replace the state, back button would simply go us back to /nav
    await browser.back().waitForElementByCss('.nav-home')
  })
})
