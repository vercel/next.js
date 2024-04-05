/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

describe('weird chars in scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // TODO: fix test case in webpack
  // It's failing with `Could not find the module ".../app/client#component.tsx#" in the React Client Manifest. This is probably a bug in the React Server Components bundler.`
  ;(process.env.TURBOPACK ? it : it.skip)(
    'should load in the browser',
    async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      const scripts = await browser.elementsByCss('script')
      for (const script of scripts) {
        const src = await script.evaluate((script) => script.src)
        expect(src).not.toContain('#')
      }
    }
  )
  ;(process.env.TURBOPACK ? it : it.skip)(
    'should load in the browser',
    async () => {
      const browser = await next.browser('/pages')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      const scripts = await browser.elementsByCss('script')
      for (const script of scripts) {
        const src = await script.evaluate((script) => script.src)
        expect(src).not.toContain('#')
      }
    }
  )
})
