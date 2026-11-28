import { formatConsoleArgs } from './console'

describe('formatConsoleArgs', () => {
  describe('%o / %O object formatting', () => {
    it('renders a plain object with its own enumerable properties', () => {
      expect(formatConsoleArgs(['%o', { a: 1, b: 2 }])).toBe('{a: 1, b: 2}')
    })

    it('renders a nested object one level deep before collapsing to "..."', () => {
      expect(formatConsoleArgs(['%o', { a: { b: 1 } }])).toBe('{a: {...}}')
    })

    it('leaves a key unquoted when JSON.stringify needs no escaping, even if not a valid identifier', () => {
      expect(formatConsoleArgs(['%o', { 'not-bare': 1 }])).toBe('{not-bare: 1}')
    })

    it('quotes a key whose JSON.stringify output differs from a naive quote-wrap', () => {
      expect(formatConsoleArgs(['%o', { 'has"quote': 1 }])).toBe(
        '{"has\\"quote": 1}'
      )
    })

    it('renders a plain object passed as a trailing argument', () => {
      expect(formatConsoleArgs([{ a: 1, b: 2 }])).toBe('{a: 1, b: 2}')
    })

    it('does not render getter/setter accessor properties', () => {
      const withAccessor = Object.defineProperty({ a: 1 }, 'b', {
        enumerable: true,
        get() {
          return 2
        },
      })
      expect(formatConsoleArgs(['%o', withAccessor])).toBe('{a: 1}')
    })
  })
})
