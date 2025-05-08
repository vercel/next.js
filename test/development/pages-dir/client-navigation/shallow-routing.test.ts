/* eslint-env jest */

import { waitFor } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client navigation with shallow routing', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should update the url without running getInitialProps', async () => {
    const browser = await next.browser('/nav/shallow-routing')
    const counter = await browser
      .elementByCss('#increase')
      .click()
      .elementByCss('#increase')
      .click()
      .elementByCss('#counter')
      .text()
    expect(counter).toBe('Counter: 2')

    const getInitialPropsRunCount = await browser
      .elementByCss('#get-initial-props-run-count')
      .text()
    expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

    await browser.close()
  })

  it('should handle the back button and should not run getInitialProps', async () => {
    const browser = await next.browser('/nav/shallow-routing')
    let counter = await browser
      .elementByCss('#increase')
      .click()
      .elementByCss('#increase')
      .click()
      .elementByCss('#counter')
      .text()
    expect(counter).toBe('Counter: 2')

    counter = await browser.back().elementByCss('#counter').text()
    expect(counter).toBe('Counter: 1')

    const getInitialPropsRunCount = await browser
      .elementByCss('#get-initial-props-run-count')
      .text()
    expect(getInitialPropsRunCount).toBe('getInitialProps run count: 1')

    await browser.close()
  })

  it('should run getInitialProps always when rending the page to the screen', async () => {
    const browser = await next.browser('/nav/shallow-routing')

    const counter = await browser
      .elementByCss('#increase')
      .click()
      .elementByCss('#increase')
      .click()
      .elementByCss('#home-link')
      .click()
      .waitForElementByCss('.nav-home')
      .back()
      .waitForElementByCss('.shallow-routing')
      .elementByCss('#counter')
      .text()
    expect(counter).toBe('Counter: 2')

    const getInitialPropsRunCount = await browser
      .elementByCss('#get-initial-props-run-count')
      .text()
    expect(getInitialPropsRunCount).toBe('getInitialProps run count: 2')

    await browser.close()
  })

  it('should keep the scroll position on shallow routing', async () => {
    const browser = await next.browser('/nav/shallow-routing')
    await browser.eval(() =>
      document.querySelector('#increase').scrollIntoView()
    )
    const scrollPosition = await browser.eval('window.pageYOffset')

    expect(scrollPosition).toBeGreaterThan(3000)

    await browser.elementByCss('#increase').click()
    await waitFor(500)
    const newScrollPosition = await browser.eval('window.pageYOffset')

    expect(newScrollPosition).toBe(scrollPosition)

    await browser.elementByCss('#increase2').click()
    await waitFor(500)
    const newScrollPosition2 = await browser.eval('window.pageYOffset')

    expect(newScrollPosition2).toBe(0)

    await browser.eval(() =>
      document.querySelector('#invalidShallow').scrollIntoView()
    )
    const scrollPositionDown = await browser.eval('window.pageYOffset')

    expect(scrollPositionDown).toBeGreaterThan(3000)

    await browser.elementByCss('#invalidShallow').click()
    await waitFor(500)
    const newScrollPosition3 = await browser.eval('window.pageYOffset')

    expect(newScrollPosition3).toBe(0)
  })
})
