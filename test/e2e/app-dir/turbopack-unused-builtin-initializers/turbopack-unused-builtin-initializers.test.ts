import { nextTestSetup } from 'e2e-utils'

describe('turbopack-unused-builtin-initializers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it.each(['callback', 'iterator', 'getter'])(
    'preserves the %s effect when the initializer result is unused',
    async (effect) => {
      const $ = await next.render$('/')
      const effects = JSON.parse($('#effects').text())
      expect(effects).toContain(effect)
    }
  )
})
