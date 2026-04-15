/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

describe('Root components import order', () => {
  const { next, isTurbopack } = nextTestSetup({
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
