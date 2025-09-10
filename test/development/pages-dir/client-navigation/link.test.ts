/* eslint-env jest */

import { waitFor, check } from 'next-test-utils'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('Client Navigation with <Link/>', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })

  it('should navigate the page', async () => {
    const browser = await next.browser('/nav')
    const text = await browser
      .elementByCss('#about-link')
      .click()
      .waitForElementByCss('.nav-about')
      .elementByCss('p')
      .text()

    expect(text).toBe('This is the about page.')
    await browser.close()
  })

  it('should navigate back after reload', async () => {
    const browser = await next.browser('/nav')
    await browser.elementByCss('#about-link').click()
    await browser.waitForElementByCss('.nav-about')
    await browser.refresh()
    await waitFor(3000)
    await browser.back()
    await waitFor(3000)
    const text = await browser.elementByCss('#about-link').text()
    if (browser) await browser.close()
    expect(text).toMatch(/About/)
  })

  it('should navigate forwards after reload', async () => {
    const browser = await next.browser('/nav')
    await browser.elementByCss('#about-link').click()
    await browser.waitForElementByCss('.nav-about')
    await browser.back()
    await browser.refresh()
    await waitFor(3000)
    await browser.forward()
    await waitFor(3000)
    const text = await browser.elementByCss('p').text()
    if (browser) await browser.close()
    expect(text).toMatch(/this is the about page/i)
  })

  it('should navigate via the client side', async () => {
    const browser = await next.browser('/nav')

    const counterText = await browser
      .elementByCss('#increase')
      .click()
      .elementByCss('#about-link')
      .click()
      .waitForElementByCss('.nav-about')
      .elementByCss('#home-link')
      .click()
      .waitForElementByCss('.nav-home')
      .elementByCss('#counter')
      .text()

    expect(counterText).toBe('Counter: 1')
    await browser.close()
  })

  it('should navigate an absolute url', async () => {
    const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
    await browser.waitForElementByCss('#absolute-link').click()
    await check(
      () => browser.eval(() => window.location.origin),
      'https://vercel.com'
    )
  })

  it('should call mouse handlers with an absolute url', async () => {
    const browser = await next.browser(`/absolute-url?port=${next.appPort}`)

    await browser.elementByCss('#absolute-link-mouse-events').moveTo()

    expect(
      await browser
        .waitForElementByCss('#absolute-link-mouse-events')
        .getAttribute('data-hover')
    ).toBe('true')
  })

  it('should navigate an absolute local url', async () => {
    const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
    // @ts-expect-error _didNotNavigate is set intentionally
    await browser.eval(() => (window._didNotNavigate = true))
    await browser.waitForElementByCss('#absolute-local-link').click()
    const text = await browser
      .waitForElementByCss('.nav-about')
      .elementByCss('p')
      .text()

    expect(text).toBe('This is the about page.')
    // @ts-expect-error _didNotNavigate is set intentionally
    expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
  })

  it('should navigate an absolute local url with as', async () => {
    const browser = await next.browser(`/absolute-url?port=${next.appPort}`)
    // @ts-expect-error _didNotNavigate is set intentionally
    await browser.eval(() => (window._didNotNavigate = true))
    await browser.waitForElementByCss('#absolute-local-dynamic-link').click()
    expect(await browser.waitForElementByCss('#dynamic-page').text()).toBe(
      'hello'
    )
    // @ts-expect-error _didNotNavigate is set intentionally
    expect(await browser.eval(() => window._didNotNavigate)).toBe(true)
  })
})
