/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'
import { check, waitFor, getBrowserBodyText } from 'next-test-utils'

export default function (context) {
  test('should render the home page', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    const text = await browser.elementByCss('#home-page p').text()

    await t.expect(text).eql('This is the home page')
    await browser.close()
  })

  test('should add trailing slash on Link', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    const link = await browser
      .elementByCss('#about-via-link')
      .getAttribute('href')

    await t.expect(link.substr(link.length - 1)).eql('/')
  })

  test('should not add trailing slash on Link when disabled', async t => {
    const browser = await webdriver(t.fixtureCtx.portNoTrailSlash, '/')
    const link = await browser
      .elementByCss('#about-via-link')
      .getAttribute('href')

    await t.expect(link.substr(link.length - 1)).notEql('/')
  })

  test('should do navigations via Link', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#about-via-link').click()
    await browser.waitForElementByCss('#about-page')

    const text = await browser.elementByCss('#about-page p').text()
    await t.expect(text).eql('This is the About page foo')
    await browser.close()
  })

  test('should do navigations via Router', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#about-via-router').click()
    await browser.waitForElementByCss('#about-page')

    const text = await browser.elementByCss('#about-page p').text()
    await t.expect(text).eql('This is the About page foo')
    await browser.close()
  })

  test('should do run client side javascript', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#counter').click()
    await browser.waitForElementByCss('#counter-page')

    await browser.elementByCss('#counter-increase').click()

    await browser.elementByCss('#counter-increase').click()

    const text = await browser.elementByCss('#counter-page p').text()
    await t.expect(text).eql('Counter: 2')
    await browser.close()
  })

  test('should render pages using getInitialProps', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#get-initial-props').click()
    await browser.waitForElementByCss('#dynamic-page')

    const text = await browser.elementByCss('#dynamic-page p').text()
    await t.expect(text).eql('cool dynamic text')
    await browser.close()
  })

  test('should render dynamic pages with custom urls', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#dynamic-1').click()
    await browser.waitForElementByCss('#dynamic-page')

    const text = await browser.elementByCss('#dynamic-page p').text()
    await t.expect(text).eql('next export is nice')
    await browser.close()
  })

  test('should support client side naviagtion', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#counter').click()
    await browser.waitForElementByCss('#counter-page')
    await browser.elementByCss('#counter-increase').click()
    await browser.elementByCss('#counter-increase').click()

    const text = await browser.elementByCss('#counter-page p').text()
    await t.expect(text).eql('Counter: 2')

    // let's go back and come again to this page:
    await browser.elementByCss('#go-back').click()
    await browser.waitForElementByCss('#home-page')
    await browser.elementByCss('#counter').click()
    await browser.waitForElementByCss('#counter-page')

    const textNow = await browser.elementByCss('#counter-page p').text()
    await t.expect(textNow).eql('Counter: 2')
    await browser.close()
  })

  test('should render dynamic import components in the client', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')
    await browser.elementByCss('#dynamic-imports-page').click()
    await browser.waitForElementByCss('#dynamic-imports-page')

    await check(
      () => browser.elementByCss('#dynamic-imports-page p').text(),
      /Welcome to dynamic imports/
    )

    await browser.close()
  })

  test('should render pages with url hash correctly', async t => {
    let browser
    try {
      browser = await webdriver(t.fixtureCtx.port, '/')

      // Check for the query string content
      await browser.elementByCss('#with-hash').click()
      await browser.waitForElementByCss('#dynamic-page')

      const text = await browser.elementByCss('#dynamic-page p').text()
      await t.expect(text).eql('zeit is awesome')
      await check(() => browser.elementByCss('#hash').text(), /cool/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  test('should navigate even if used a button inside <Link />', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/button-link')

    await browser.elementByCss('button').click()
    await browser.waitForElementByCss('#home-page')

    const text = await browser.elementByCss('#home-page p').text()
    await t.expect(text).eql('This is the home page')
    await browser.close()
  })

  test('should update query after mount', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/query?hello=1')

    await waitFor(1000)
    const text = await browser.eval('document.body.innerHTML')
    await t.expect(text).match(/hello/)
    await browser.close()
  })

  test('should render the home page', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')

    await browser.eval('document.getElementById("level1-home-page").click()')

    await check(
      () => getBrowserBodyText(browser),
      /This is the Level1 home page/
    )

    await browser.close()
  })

  test('should render the about page', async t => {
    const browser = await webdriver(t.fixtureCtx.port, '/')

    await browser.eval('document.getElementById("level1-about-page").click()')

    await check(
      () => getBrowserBodyText(browser),
      /This is the Level1 about page/
    )

    await browser.close()
  })
}
