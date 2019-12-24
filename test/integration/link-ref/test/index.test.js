/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  waitFor,
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
let app
let appPort
const appDir = join(__dirname, '..')

const noError = async pathname => {
  const browser = await webdriver(appPort, '/')
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
  expect(numErrors).toBe(0)
  await browser.close()
}

const didPrefetch = async pathname => {
  const browser = await webdriver(appPort, pathname)
  await waitFor(500)
  const links = await browser.elementsByCss('link[rel=prefetch]')
  let found = false

  for (const link of links) {
    const href = await link.getAttribute('href')
    if (href.includes('index')) {
      found = true
      break
    }
  }
  expect(found).toBe(true)
  await browser.close()
}

describe('Invalid hrefs', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should not show error for functional component with forwardRef', async () => {
      await noError('/functional')
    })

    it('should not show error for class component as child of next/link', async () => {
      await noError('/class')
    })

    it('should handle child ref with React.createRef', async () => {
      await noError('/child-ref')
    })

    it('should handle child ref that is a function', async () => {
      await noError('/child-ref-func')
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    it('should preload with forwardRef', async () => {
      await didPrefetch('/functional')
    })

    it('should preload with child ref with React.createRef', async () => {
      await didPrefetch('/child-ref')
    })

    it('should preload with child ref with function', async () => {
      await didPrefetch('/child-ref-func')
    })
  })
})
