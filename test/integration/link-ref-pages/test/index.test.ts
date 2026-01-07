/* eslint-env jest */

import { join } from 'path'
import webdriver from 'next-webdriver'
import {
  retry,
  findPort,
  launchApp,
  killApp,
  nextStart,
  nextBuild,
  waitFor,
  getClientBuildManifestLoaderChunkUrlPath,
} from 'next-test-utils'

let app
let appPort
const appDir = join(__dirname, '..')

const noError = async (pathname) => {
  const browser = await webdriver(appPort, '/')
  await browser.eval(`(function() {
    window.caughtErrors = []
    const origError = window.console.error
    window.console.error = function (format) {
      window.caughtErrors.push(format)
      origError(arguments)
    }
    window.next.router.replace('${pathname}')
  })()`)
  await waitFor(1000)
  const errors = await browser.eval(`window.caughtErrors`)
  expect(errors).toEqual([])
  await browser.close()
}

const didPrefetch = async (pathname) => {
  const browser = await webdriver(appPort, pathname)

  let chunk = getClientBuildManifestLoaderChunkUrlPath(appDir, '/')

  await retry(async () => {
    const links = await browser.elementsByCss('link[rel=prefetch]')

    const hrefs = await Promise.all(
      links.map((link) => link.getAttribute('href'))
    )

    expect(hrefs).toEqual(
      expect.arrayContaining([expect.stringContaining(chunk)])
    )
  })

  await browser.close()
}

function runCommonTests() {
  // See https://github.com/vercel/next.js/issues/18437
  it('should not have a race condition with a click handler', async () => {
    const browser = await webdriver(appPort, '/click-away-race-condition')
    await browser.elementByCss('#click-me').click()
    await browser.waitForElementByCss('#the-menu')
  })
}

describe('Invalid hrefs', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runCommonTests()

      it('should not show error for function component with forwardRef', async () => {
        await noError('/function')
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

      it('should handle child ref that is a function that returns a cleanup function', async () => {
        await noError('/child-ref-func-cleanup')
      })
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runCommonTests()

      it('should preload with forwardRef', async () => {
        await didPrefetch('/function')
      })

      it('should preload with child ref with React.createRef', async () => {
        await didPrefetch('/child-ref')
      })

      it('should preload with child ref with function', async () => {
        await didPrefetch('/child-ref-func')
      })

      it('should preload with child ref with function that returns a cleanup function', async () => {
        await didPrefetch('/child-ref-func-cleanup')
      })
    }
  )
})
