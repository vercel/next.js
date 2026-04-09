/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'
import { ElementHandle } from 'playwright'

describe('scripts', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // TODO: fix test case in webpack
  // It's failing with `Could not find the module ".../app/client#component.tsx#" in the React Client Manifest. This is probably a bug in the React Server Components bundler.`
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip).each(['app', 'pages'])(
    'encodes characters in %s router',
    async (routerType) => {
      const browser = await next.browser(routerType === 'app' ? '/' : '/pages')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
      const scripts = (await browser.elementsByCss(
        'script'
      )) as ElementHandle<HTMLScriptElement>[]
      expect(scripts.length).toBeGreaterThan(0)
      for (const script of scripts) {
        const src = await script.evaluate((script) => script.src)
        expect(src).not.toContain('#')
        expect(src).not.toContain('[')
      }
    }
  )
})

describe('styles', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  // TODO: fix test case in webpack
  // It's failing with `Could not find the module ".../app/client#component.tsx#" in the React Client Manifest. This is probably a bug in the React Server Components bundler.`
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip).each(['app', 'pages'])(
    'encodes characters in %s router',
    async (routerType) => {
      const browser = await next.browser(routerType === 'app' ? '/' : '/pages')

      let body = await browser.elementByCss('body')
      expect(
        await body.evaluate((el) =>
          getComputedStyle(el as Element).getPropertyValue('background-color')
        )
      ).toBe('rgb(0, 0, 255)')

      const stylesheets = (await browser.elementsByCss(
        'link[rel="stylesheet"]'
      )) as ElementHandle<HTMLLinkElement>[]
      expect(stylesheets.length).toBeGreaterThan(0)
      for (const stylesheet of stylesheets) {
        const href = await stylesheet.evaluate((stylesheet) => stylesheet.href)
        console.log('app href', href)
        expect(href).not.toContain('#')
        expect(href).not.toContain('[')
      }
    }
  )
})
