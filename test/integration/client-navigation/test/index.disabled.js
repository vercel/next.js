/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import renderingSuite from './rendering'
import {
  waitFor,
  findPort,
  killApp,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP,
  getReactErrorOverlayContent
} from 'next-test-utils'

fixture('Client Navigation')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.server = await launchApp(join(__dirname, '../'), ctx.appPort)

    const prerender = [
      '/async-props',
      '/default-head',
      '/empty-get-initial-props',
      '/error',
      '/finish-response',
      '/head',
      '/json',
      '/link',
      '/stateless',
      '/fragment-syntax',
      '/custom-extension',
      '/styled-jsx',
      '/with-cdm',
      '/url-prop',
      '/url-prop-override',

      '/dynamic/ssr',

      '/nav',
      '/nav/about',
      '/nav/on-click',
      '/nav/querystring',
      '/nav/self-reload',
      '/nav/hash-changes',
      '/nav/shallow-routing',
      '/nav/redirect',
      '/nav/as-path',
      '/nav/as-path-using-router',
      '/nav/url-prop-change',

      '/nested-cdm/index'
    ]
    await Promise.all(prerender.map(route => renderViaHTTP(ctx.appPort, route)))
  })
  .after(ctx => killApp(ctx.server))

test('should navigate the page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#about-link').click()

  await browser.waitForElementByCss('.nav-about')

  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('This is the about page.')
  await browser.close()
})

test('should navigate via the client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')

  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#about-link').click()
  await browser.waitForElementByCss('.nav-about')
  await browser.elementByCss('#home-link').click()
  await browser.waitForElementByCss('.nav-home')

  const counterText = await browser.elementByCss('#counter').text()
  await t.expect(counterText).eql('Counter: 1')
  await browser.close()
})

test('Should keep immutable pathname, asPath and query', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/url-prop-change')
  await browser.elementByCss('#add-query').click()
  const urlResult = await browser.elementByCss('#url-result').text()
  const previousUrlResult = await browser
    .elementByCss('#previous-url-result')
    .text()

  await t.expect(JSON.parse(urlResult)).eql({
    query: { added: 'yes' },
    pathname: '/nav/url-prop-change',
    asPath: '/nav/url-prop-change?added=yes'
  })
  await t.expect(JSON.parse(previousUrlResult)).eql({
    query: {},
    pathname: '/nav/url-prop-change',
    asPath: '/nav/url-prop-change'
  })

  await browser.close()
})

test('should navigate the page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/about')
  await browser.elementByCss('#home-link').click()
  await browser.waitForElementByCss('.nav-home')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the home.')
  await browser.close()
})

test('should not navigate if the <a/> tag has a target', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')

  await browser.elementByCss('#increase').click()

  // right now testcafe can't handle target links but we can still
  // test this by checking if it was a hard navigate
  await browser.eval('window.beforeTargetLink = true')
  await browser.elementByCss('#target-link').click()

  const val = await browser.eval(`window.beforeTargetLink`)
  await t.expect(val).notOk()
  await browser.close()
})

test('should not redirect if passHref prop is not defined in Link', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/pass-href-prop')
  await browser.elementByCss('#without-href').click()
  await browser.waitForElementByCss('.nav-pass-href-prop')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the passHref prop page.')
  await browser.close()
})

test('should redirect if passHref prop is defined in Link', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/pass-href-prop')
  await browser.elementByCss('#with-href').click()
  await browser.waitForElementByCss('.nav-home')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the home.')
  await browser.close()
})

test('should render an error', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav')
    await browser.elementByCss('#empty-props').click()

    await waitFor(3000)

    await t
      .expect(await getReactErrorOverlayContent(browser))
      .match(/should resolve to an object\. But found "null" instead\./)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should navigate the page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/querystring?id=1')
  await browser.elementByCss('#next-id-link').click()
  await browser.waitForElementByCss('.nav-id-2')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('2')
  await browser.close()
})

test('should remove querystring', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/querystring?id=1')
  await browser.elementByCss('#main-page').click()
  await browser.waitForElementByCss('.nav-id-0')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('0')
  await browser.close()
})

test('should reload the page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/self-reload')
  const defaultCount = await browser.elementByCss('p').text()
  await t.expect(defaultCount).eql('COUNT: 0')
  await browser.elementByCss('#self-reload-link').click()

  const countAfterClicked = await browser.elementByCss('p').text()
  await t.expect(countAfterClicked).eql('COUNT: 1')
  await browser.close()
})

test('should always replace the state', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')

  await browser.elementByCss('#self-reload-link').click()
  await browser.waitForElementByCss('#self-reload-page')
  await browser.elementByCss('#self-reload-link').click()
  await browser.elementByCss('#self-reload-link').click()

  const countAfterClicked = await browser.elementByCss('p').text()
  // counts (page change + two clicks)
  await t.expect(countAfterClicked).eql('COUNT: 3')

  // Since we replace the state, back button would simply go us back to /nav
  await browser.back()
  await browser.waitForElementByCss('.nav-home')

  await browser.close()
})

test('should reload the page and perform additional action', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/on-click')
    const defaultCountQuery = await browser.elementByCss('#query-count').text()
    const defaultCountState = await browser.elementByCss('#state-count').text()
    await t.expect(defaultCountQuery).eql('QUERY COUNT: 0')
    await t.expect(defaultCountState).eql('STATE COUNT: 0')

    await browser.elementByCss('#on-click-link').click()

    const countQueryAfterClicked = await browser
      .elementByCss('#query-count')
      .text()
    const countStateAfterClicked = await browser
      .elementByCss('#state-count')
      .text()
    await t.expect(countQueryAfterClicked).eql('QUERY COUNT: 1')
    await t.expect(countStateAfterClicked).eql('STATE COUNT: 1')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not reload if default was prevented', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/on-click')
    const defaultCountQuery = await browser.elementByCss('#query-count').text()
    const defaultCountState = await browser.elementByCss('#state-count').text()
    await t.expect(defaultCountQuery).eql('QUERY COUNT: 0')
    await t.expect(defaultCountState).eql('STATE COUNT: 0')

    await browser.elementByCss('#on-click-link-prevent-default').click()

    const countQueryAfterClicked = await browser
      .elementByCss('#query-count')
      .text()
    const countStateAfterClicked = await browser
      .elementByCss('#state-count')
      .text()
    await t.expect(countQueryAfterClicked).eql('QUERY COUNT: 0')
    await t.expect(countStateAfterClicked).eql('STATE COUNT: 1')

    await browser.elementByCss('#on-click-link').click()

    const countQueryAfterClickedAgain = await browser
      .elementByCss('#query-count')
      .text()
    const countStateAfterClickedAgain = await browser
      .elementByCss('#state-count')
      .text()
    await t.expect(countQueryAfterClickedAgain).eql('QUERY COUNT: 1')
    await t.expect(countStateAfterClickedAgain).eql('STATE COUNT: 2')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should always replace the state and perform additional action', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav')

    await browser.elementByCss('#on-click-link').click()

    await browser.waitForElementByCss('#on-click-page')

    const defaultCountQuery = await browser.elementByCss('#query-count').text()
    await t.expect(defaultCountQuery).eql('QUERY COUNT: 1')

    await browser.elementByCss('#on-click-link').click()
    const countQueryAfterClicked = await browser
      .elementByCss('#query-count')
      .text()
    const countStateAfterClicked = await browser
      .elementByCss('#state-count')
      .text()
    await t.expect(countQueryAfterClicked).eql('QUERY COUNT: 2')
    await t.expect(countStateAfterClicked).eql('STATE COUNT: 1')

    // Since we replace the state, back button would simply go us back to /nav
    await browser.back()
    await browser.waitForElementByCss('.nav-home')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#via-link').click()
  const counter = await browser.elementByCss('p').text()

  await t.expect(counter).eql('COUNT: 0')

  await browser.close()
})

test('should scroll to the specified position on the same page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

    // Scrolls to item 400 on the page
    await browser.elementByCss('#scroll-to-item-400').click()
    const scrollPosition = await browser.eval('window.pageYOffset')

    await t.expect(scrollPosition).eql(7258)

    // Scrolls back to top when scrolling to `#` with no value.
    await browser.elementByCss('#via-empty-hash').click()
    const scrollPositionAfterEmptyHash = await browser.eval(
      'window.pageYOffset'
    )

    await t.expect(scrollPositionAfterEmptyHash).eql(0)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should scroll to the specified position on the same page with a name property', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

    // Scrolls to item 400 with name="name-item-400" on the page
    await browser.elementByCss('#scroll-to-name-item-400').click()

    const scrollPosition = await browser.eval('window.pageYOffset')

    console.log(scrollPosition)

    await t.expect(scrollPosition).eql(16258)

    // Scrolls back to top when scrolling to `#` with no value.
    await browser.elementByCss('#via-empty-hash').click()
    const scrollPositionAfterEmptyHash = await browser.eval(
      'window.pageYOffset'
    )

    await t.expect(scrollPositionAfterEmptyHash).eql(0)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should scroll to the specified position to a new page', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav')

    // Scrolls to item 400 on the page
    await browser.elementByCss('#scroll-to-hash').click()
    await browser.waitForElementByCss('#hash-changes-page')

    const scrollPosition = await browser.eval('window.pageYOffset')
    await t.expect(scrollPosition).eql(7258)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#via-a').click()
  const counter = await browser.elementByCss('p').text()

  await t.expect(counter).eql('COUNT: 0')

  await browser.close()
})

test('should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#via-a').click()
  await browser.elementByCss('#page-url').click()

  const counter = await browser.elementByCss('p').text()
  await t.expect(counter).eql('COUNT: 1')

  await browser.close()
})

test('should not run getInitialProps when removing via back', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#scroll-to-item-400').click()
  await browser.back()

  const counter = await browser.elementByCss('p').text()
  await t.expect(counter).eql('COUNT: 0')
  await browser.close()
})

test('should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#via-a').click()
  await browser.elementByCss('#via-empty-hash').click()

  const counter = await browser.elementByCss('p').text()
  await t.expect(counter).eql('COUNT: 0')

  await browser.close()
})

test('should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/hash-changes')

  await browser.elementByCss('#via-a').click()
  await browser.elementByCss('#via-link').click()

  const counter = await browser.elementByCss('p').text()
  await t.expect(counter).eql('COUNT: 0')

  await browser.close()
})

test('should update the url without running getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/shallow-routing')
  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#increase').click()

  const counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 2')

  const getInitialPropsRunCount = await browser
    .elementByCss('#get-initial-props-run-count')
    .text()
  await t.expect(getInitialPropsRunCount).eql('getInitialProps run count: 1')

  await browser.close()
})

test('should handle the back button and should not run getInitialProps', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/shallow-routing')
  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#increase').click()

  let counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 2')

  await browser.back()

  counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 1')

  const getInitialPropsRunCount = await browser
    .elementByCss('#get-initial-props-run-count')
    .text()
  await t.expect(getInitialPropsRunCount).eql('getInitialProps run count: 1')

  await browser.close()
})

test('should run getInitialProps always when rending the page to the screen', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/shallow-routing')

  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#increase').click()
  await browser.elementByCss('#home-link').click()
  await browser.waitForElementByCss('.nav-home')
  await browser.back()
  await browser.waitForElementByCss('.shallow-routing')

  const counter = await browser.elementByCss('#counter').text()
  await t.expect(counter).eql('Counter: 2')

  const getInitialPropsRunCount = await browser
    .elementByCss('#get-initial-props-run-count')
    .text()
  await t.expect(getInitialPropsRunCount).eql('getInitialProps run count: 2')

  await browser.close()
})

test('should work with <Link/>', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#query-string-link').click()
  await browser.waitForElementByCss('.nav-querystring')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('10')

  await t
    .expect(await browser.url())
    .eql(`http://localhost:${t.fixtureCtx.appPort}/nav/querystring/10#10`)
  await browser.close()
})

test('should work with "Router.push"', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#query-string-button').click()
  await browser.waitForElementByCss('.nav-querystring')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('10')

  await t
    .expect(await browser.url())
    .eql(`http://localhost:${t.fixtureCtx.appPort}/nav/querystring/10#10`)
  await browser.close()
})

// Updated to not rely on history.length since it's unreliable
test('should work with the "replace" prop', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')

  // Navigation to /about using normal link should add it to history
  await browser.elementByCss('#about-link').click()
  await browser.waitForElementByCss('.nav-about')

  await browser.elementByCss('#home-link').click()
  await browser.waitForElementByCss('.nav-home')

  // Navigation to /about using a replace link should replace home in the history
  await browser.elementByCss('#about-replace-link').click()
  await browser.waitForElementByCss('.nav-about')

  let text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the about page.')

  // Navigating back should remain on the about page since
  // home was replaced by it and the previous entry was about
  await browser.back()

  text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the about page.')

  await browser.elementByCss('#home-link').click()
  await browser.waitForElementByCss('.nav-home')

  await browser.close()
})

test('should redirect the page via client side', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#redirect-link').click()
  await browser.waitForElementByCss('.nav-about')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the about page.')
  await browser.close()
})

test('should redirect the page when loading', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/redirect')
  await browser.waitForElementByCss('.nav-about')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the about page.')
  await browser.close()
})

test('should work with normal page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/with-cdm')
  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('ComponentDidMount executed on client.')
  await browser.close()
})

test('should work with dir/ page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nested-cdm')
  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('ComponentDidMount executed on client.')
  await browser.close()
})

test('should work with /index page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/index')
  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('ComponentDidMount executed on client.')
  await browser.close()
})

test('should work with / page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  const text = await browser.elementByCss('p').text()

  await t.expect(text).eql('ComponentDidMount executed on client.')
  await browser.close()
})

test('should navigate as expected', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/with-hoc')

  const pathname = await browser.elementByCss('#pathname').text()
  await t.expect(pathname).eql('Current path: /nav/with-hoc')

  const asPath = await browser.elementByCss('#asPath').text()
  await t.expect(asPath).eql('Current asPath: /nav/with-hoc')

  await browser.elementByCss('.nav-with-hoc a').click()
  await browser.waitForElementByCss('.nav-home')

  const text = await browser.elementByCss('p').text()
  await t.expect(text).eql('This is the home.')
  await browser.close()
})

test('should show the correct asPath with a Link with as prop', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#as-path-link').click()
  await browser.waitForElementByCss('.as-path-content')

  const asPath = await browser.elementByCss('.as-path-content').text()
  await t.expect(asPath).eql('/as/path')
  await browser.close()
})

test('should show the correct asPath with a Link without the as prop', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#as-path-link-no-as').click()
  await browser.waitForElementByCss('.as-path-content')

  const asPath = await browser.elementByCss('.as-path-content').text()
  await t.expect(asPath).eql('/nav/as-path')
  await browser.close()
})

test('should show the correct asPath', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav')
  await browser.elementByCss('#as-path-using-router-link').click()
  await browser.waitForElementByCss('.as-path-content')

  const asPath = await browser.elementByCss('.as-path-content').text()
  await t.expect(asPath).eql('/nav/as-path-using-router')
  await browser.close()
})

test('should use pushState with same href and different asPath', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/as-path-pushstate')
    await browser.elementByCss('#hello').click()
    await browser.waitForElementByCss('#something-hello')

    const queryOne = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryOne.something).eql('hello')
    await browser.elementByCss('#same-query').click()
    await browser.waitForElementByCss('#something-same-query')

    const queryTwo = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryTwo.something).eql('hello')
    await browser.back()
    await browser.waitForElementByCss('#something-hello')

    const queryThree = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryThree.something).eql('hello')
    await browser.elementByCss('#else').click()
    await browser.waitForElementByCss('#something-else')

    await browser.elementByCss('#hello2').click()
    await browser.waitForElementByCss('#nav-as-path-pushstate')
    await browser.back()
    await browser.waitForElementByCss('#something-else')

    const queryFour = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryFour.something).eql(undefined)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should detect asPath query changes correctly', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/as-path-query')
    await browser.elementByCss('#hello').click()
    await browser.waitForElementByCss('#something-hello-something-hello')

    const queryOne = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryOne.something).eql('hello')
    await browser.elementByCss('#hello2').click()
    await browser.waitForElementByCss('#something-hello-something-else')

    const queryTwo = JSON.parse(
      await browser.elementByCss('#router-query').text()
    )
    await t.expect(queryTwo.something).eql('else')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should show react-error-overlay when a client side error is thrown inside a component', async t => {
  let browser
  try {
    browser = await webdriver(
      t.fixtureCtx.appPort,
      '/error-inside-browser-page'
    )
    await waitFor(3000)
    const text = await getReactErrorOverlayContent(browser)
    await t.expect(text).match(/An Expected error occurred/)
    await t.expect(text).match(/pages\/error-inside-browser-page\.js/)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should show react-error-overlay when a client side error is thrown outside a component', async t => {
  let browser
  try {
    browser = await webdriver(
      t.fixtureCtx.appPort,
      '/error-in-the-browser-global-scope'
    )
    await waitFor(3000)
    const text = await getReactErrorOverlayContent(browser)
    await t.expect(text).match(/An Expected error occurred/)
    await t.expect(text).match(/error-in-the-browser-global-scope\.js/)
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should 404 on not existent page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/non-existent')
  await t.expect(await browser.elementByCss('h1').text()).eql('404')
  await t
    .expect(await browser.elementByCss('h2').text())
    .eql('This page could not be found.')
  await browser.close()
})

test('should 404 for <page>/', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nav/about/')
  await t.expect(await browser.elementByCss('h1').text()).eql('404')
  await t
    .expect(await browser.elementByCss('h2').text())
    .eql('This page could not be found.')
  await browser.close()
})

test('should should not contain a page script in a 404 page', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/non-existent')
  const scripts = await browser.elementsByCss('script[src]')
  for (const script of scripts) {
    const src = await script.getAttribute('src')
    await t.expect(src.includes('/non-existent')).notOk()
  }
  await browser.close()
})

test('should update head during client routing', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/head-1')
    await t
      .expect(
        await browser
          .elementByCss('meta[name="description"]')
          .getAttribute('content')
      )
      .eql('Head One')

    await browser.elementByCss('#to-head-2').click()
    await browser.waitForElementByCss('#head-2', 3000)
    await t
      .expect(
        await browser
          .elementByCss('meta[name="description"]')
          .getAttribute('content')
      )
      .eql('Head Two')

    await browser.elementByCss('#to-head-1').click()

    await browser.waitForElementByCss('#head-1', 3000)
    await t
      .expect(
        await browser
          .elementByCss('meta[name="description"]')
          .getAttribute('content')
      )
      .eql('Head One')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should update title during client routing', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/nav/head-1')
    await t.expect(await browser.eval('document.title')).eql('this is head-1')

    await browser.elementByCss('#to-head-2').click()
    await browser.waitForElementByCss('#head-2', 3000)

    await t.expect(await browser.eval('document.title')).eql('this is head-2')

    await browser.elementByCss('#to-head-1').click()
    await browser.waitForElementByCss('#head-1', 3000)

    await t.expect(await browser.eval('document.title')).eql('this is head-1')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should not error on module.exports + polyfills', async t => {
  let browser
  try {
    browser = await webdriver(t.fixtureCtx.appPort, '/read-only-object-error')
    await t
      .expect(await browser.elementByCss('body').text())
      .contains('this is just a placeholder component')
  } finally {
    if (browser) {
      await browser.close()
    }
  }
})

test('should work on nested /index/index.js', async t => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/nested-index/index')
  await t
    .expect(await browser.elementByCss('p').text())
    .contains('This is an index.js nested in an index/ folder.')
  await browser.close()
})

renderingSuite(
  (p, q) => renderViaHTTP(t.fixtureCtx.appPort, p, q),
  (p, q) => fetchViaHTTP(t.fixtureCtx.appPort, p, q)
)
