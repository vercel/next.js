/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  retry,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')

let appPort
let app

const checkWindowValues = async (
  browser,
  expression: string,
  expected: unknown[]
) => {
  await retry(async () => {
    expect(await browser.eval(expression)).toEqual(expected)
  })
}

const runTests = () => {
  describe('with middleware', () => {
    it('should not trigger unnecessary rerenders when middleware is used', async () => {
      const browser = await webdriver(appPort, '/')
      // `/` has no `foo` query param, so a stable single render records one
      // `undefined` entry instead of `[undefined, undefined]`.
      await checkWindowValues(browser, 'window.__renders', [undefined])
    })
  })
}

const runRewriteTests = () => {
  describe('with rewrites', () => {
    it('should not trigger unnecessary rerenders when rewrites are used on other routes', async () => {
      const browser = await webdriver(appPort, '/')
      // `/` has no `foo` query param, so a stable single render records one
      // `undefined` entry instead of `[undefined, undefined]`.
      await checkWindowValues(browser, 'window.__renders', [undefined])
    })

    it('should not trigger an extra rerender when a matched rewrite reconciliation is not required', async () => {
      const browser = await webdriver(appPort, '/rewrite-to-gsp-not-required')
      // The matched rewrite resolves to the same initial route/query snapshot,
      // so the getStaticProps page should still render only once.
      await checkWindowValues(
        browser,
        'window.__getStaticPropsRewriteRenders',
        [undefined]
      )
    })

    it('should rerender with the correct query parameter if rewrite reconciliation is still needed', async () => {
      const browser = await webdriver(appPort, '/rewrite-to-gsp')
      await checkWindowValues(
        browser,
        'window.__getStaticPropsRewriteRenders',
        [undefined, 'bar']
      )
    })

    it('should keep the conservative fallback when rewrite reconciliation stays unknown', async () => {
      const browser = await webdriver(appPort, '/rewrite-to-gsp-unsafe')
      await checkWindowValues(
        browser,
        'window.__getStaticPropsRewriteRenders',
        [undefined, 'bar']
      )
    })
  })
}

describe('router rerender', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
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

      runTests()
      runRewriteTests()
    }
  )
})
