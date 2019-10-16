/* global fixture, test */
import { t } from 'testcafe'

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  getReactErrorOverlayContent,
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '..')

const firstErrorRegex = /Invalid href passed to router: mailto:idk@idk.com.*invalid-href-passed/
const secondErrorRegex = /Invalid href passed to router: .*google\.com.*invalid-href-passed/

const showsError = async (pathname, regex, click = false) => {
  const browser = await webdriver(t.fixtureCtx.appPort, pathname)
  if (click) {
    await browser.elementByCss('a').click()
  }
  const errorContent = await getReactErrorOverlayContent(browser)
  await t.expect(errorContent).match(regex)
  await browser.close()
}

const noError = async (pathname, click = false) => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await waitFor(500)
  await browser.eval(`(function() {
    window.caughtErrors = []
    window.addEventListener('error', function (error) {
      window.caughtErrors.push(error.message || 1)
    })
    window.addEventListener('unhandledrejection', function (error) {
      window.caughtErrors.push(error.message || 1)
    })
    window.next.router.replace('${pathname}')
  })()`)
  await waitFor(250)
  if (click) {
    await browser.elementByCss('a').click()
  }
  const numErrors = await browser.eval(`window.caughtErrors.length`)
  await t.expect(numErrors).eql(0)
  await browser.close()
}

fixture('Invalid hrefs')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('shows error when mailto: is used as href on Link', async t => {
  await showsError('/first', firstErrorRegex)
})

test('shows error when mailto: is used as href on router.push', async t => {
  await showsError('/first?method=push', firstErrorRegex, true)
})

test('shows error when mailto: is used as href on router.replace', async t => {
  await showsError('/first?method=replace', firstErrorRegex, true)
})

test('shows error when https://google.com is used as href on Link', async t => {
  await showsError('/second', secondErrorRegex)
})

test('shows error when http://google.com is used as href on router.push', async t => {
  await showsError('/second?method=push', secondErrorRegex, true)
})

test('shows error when https://google.com is used as href on router.replace', async t => {
  await showsError('/second?method=replace', secondErrorRegex, true)
})

test('shows error when dynamic route mismatch is used on Link', async t => {
  await showsError(
    '/dynamic-route-mismatch',
    /The provided `as` value is incompatible with the `href` value/,
    true
  )
})

fixture('production mode')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('does not show error in production when mailto: is used as href on Link', async t => {
  await noError('/first')
})

test('does not show error in production when mailto: is used as href on router.push', async t => {
  await noError('/first?method=push', true)
})

test('does not show error in production when mailto: is used as href on router.replace', async t => {
  await noError('/first?method=replace', true)
})

test('does not show error in production when https://google.com is used as href on Link', async t => {
  await noError('/second')
})

test('does not show error in production when http://google.com is used as href on router.push', async t => {
  await noError('/second?method=push', true)
})

test('does not show error in production when https://google.com is used as href on router.replace', async t => {
  await noError('/second?method=replace', true)
})
