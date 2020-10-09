/* eslint-env jest */
import {
  urlQueryToSearchParams,
  assign,
} from 'next/dist/next-server/lib/router/utils/querystring'

describe('querystring', () => {
  describe('urlQueryToSearchParams', () => {
    it('should construct a sorted url query', () => {
      const result = urlQueryToSearchParams({
        foo: 1,
        baz: false,
        bar: '2',
        bla: ['2', 1, false],
      })
      expect(result.toString()).toBe(
        `bar=2&baz=false&bla=2&bla=1&bla=false&foo=1`
      )
    })

    it('should convert none string/number/boolean values to empty string', () => {
      const result = urlQueryToSearchParams({
        foo: 1,
        bar: null,
        baz: undefined,
        obj: { val: '1' },
      })
      expect(result.toString()).toBe(`bar=&baz=&foo=1&obj=`)
    })
  })

  describe('assign', () => {
    it('should assign rest to target and return a sorted URLSearchParams', () => {
      let target = new URLSearchParams()
      const result = assign(
        target,
        new URLSearchParams('foo=1&bar=false'),
        new URLSearchParams({ baz: 'val' })
      )
      expect(result.toString()).toBe(`bar=false&baz=val&foo=1`)
    })
  })
})
