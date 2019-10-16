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
  waitFor
} from 'next-test-utils'

const appDir = join(__dirname, '..')

const noError = async pathname => {
  const browser = await webdriver(t.fixtureCtx.appPort, '/')
  await browser.eval(`(function() {
    window.caughtErrors = []
    const origError = window.console.error
    window.console.error = function () {
      window.caughtErrors.push(1)
      origError(arguments)
    }
    window.next.router.replace('${pathname}')
  })()`)
  await waitFor(1000)
  const numErrors = await browser.eval(`window.caughtErrors.length`)
  await t.expect(numErrors).eql(0)
  await browser.close()
}

const didPreload = async pathname => {
  const browser = await webdriver(t.fixtureCtx.appPort, pathname)
  await waitFor(500)
  const links = await browser.elementsByCss('link[rel=preload]')
  let found = false

  for (const link of links) {
    const href = await link.getAttribute('href')
    if (href.includes('index')) {
      found = true
      break
    }
  }
  await t.expect(found).eql(true)
  await browser.close()
}

fixture('Invalid hrefs')

fixture('dev mode')
  .before(async ctx => {
    ctx.appPort = await findPort()
    ctx.app = await launchApp(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should not show error for functional component with forwardRef', async t => {
  await noError('/functional')
})

test('should not show error for class component as child of next/link', async t => {
  await noError('/class')
})

test('should handle child ref with React.createRef', async t => {
  await noError('/child-ref')
})

test('should handle child ref that is a function', async t => {
  await noError('/child-ref-func')
})

fixture('production mode')
  .before(async ctx => {
    await nextBuild(appDir)
    ctx.appPort = await findPort()
    ctx.app = await nextStart(appDir, ctx.appPort)
  })
  .after(ctx => killApp(ctx.app))

test('should preload with forwardRef', async t => {
  await didPreload('/functional')
})

test('should preload with child ref with React.createRef', async t => {
  await didPreload('/child-ref')
})

test('should preload with child ref with function', async t => {
  await didPreload('/child-ref-func')
})
