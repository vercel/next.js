/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

describe('Root components import order', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('root components should be imported in order _document > _app > page to respect side effects', async () => {
    const $ = await next.render$('/')

    const expectSideEffectsOrder = ['_document', '_app', 'page']
    const sideEffectCalls = $('.side-effect-calls')

    Array.from(sideEffectCalls).forEach((sideEffectCall, index) => {
      expect($(sideEffectCall).text()).toEqual(expectSideEffectsOrder[index])
    })
  })

  // Only asserted for production builds: in development each entry is chunked from its own
  // per-page module graph, which can still merge a shared module into per-entry units.
  ;(isNextDev ? it.skip : it)(
    'loads modules shared by _app and the page only once',
    async () => {
      const requests: Set<string> = new Set()
      await next.browser('/', {
        beforePageLoad(page) {
          page.on('request', (request) => {
            const url = new URL(request.url(), next.url)
            if (
              url.pathname.startsWith('/_next/static/') &&
              url.pathname.endsWith('.js')
            ) {
              requests.add(url.href)
            }
          })
        },
      })

      const chunks = await Promise.all(
        [...requests].map((url) =>
          fetch(url).then((response) => response.text())
        )
      )
      const matchingChunks = chunks.filter((chunk) =>
        chunk.includes('APP_PAGE_SHARED_MODULE_MARKER')
      )

      expect(matchingChunks.length).toBe(1)
    }
  )

  // Test relies on webpack splitChunks overrides.
  ;(isTurbopack ? it.skip : it)(
    '_app chunks should be attached to the dom before page chunks',
    async () => {
      const $ = await next.render$('/')

      const requiredByRegex = /^\/_next\/static\/chunks\/(requiredBy\w*).*\.js/
      const chunks = Array.from($('head').contents())
        .filter(
          (child: any) =>
            child.type === 'script' &&
            child.name === 'script' &&
            child.attribs.src.match(requiredByRegex)
        )
        .map((child: any) => child.attribs.src.match(requiredByRegex)[1])

      const requiredByAppIndex = chunks.indexOf('requiredByApp')
      const requiredByPageIndex = chunks.indexOf('requiredByPage')

      expect(requiredByAppIndex).toBeLessThan(requiredByPageIndex)
    }
  )
})
