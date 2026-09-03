import { searchParamsToUrlQuery, urlQueryToSearchParams } from './querystring'

describe('searchParamsToUrlQuery', () => {
  it('reads a single parameter and repeats into an array', () => {
    expect(searchParamsToUrlQuery(new URLSearchParams('a=1'))).toEqual({
      a: '1',
    })
    expect(searchParamsToUrlQuery(new URLSearchParams('a=1&a=2&a=3'))).toEqual({
      a: ['1', '2', '3'],
    })
  })

  it.each(['constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'reads a parameter named %p, which shadows an Object.prototype member',
    (key) => {
      // Reading through the prototype chain reported the inherited member as an
      // already-seen value, so the parameter came back as `[Function, '1']`.
      expect(searchParamsToUrlQuery(new URLSearchParams(`${key}=1`))).toEqual({
        [key]: '1',
      })
      expect(
        searchParamsToUrlQuery(new URLSearchParams(`${key}=1&${key}=2`))
      ).toEqual({ [key]: ['1', '2'] })
    }
  )

  it('reads a parameter named __proto__ without moving the prototype', () => {
    const query = searchParamsToUrlQuery(new URLSearchParams('__proto__=1&a=2'))

    // `query.__proto__ = '1'` hit the inherited setter, so the parameter was
    // dropped and the object's prototype was replaced instead.
    expect(Object.keys(query).sort()).toEqual(['__proto__', 'a'])
    expect(query['__proto__']).toBe('1')
    expect(Object.getPrototypeOf(query)).toBe(Object.prototype)
  })

  it('returns an ordinary object, so prototype methods stay callable', () => {
    // `router.query` is public API and callers do reach for these, e.g.
    // `compareRouterStates` in ./compare-states.
    const query = searchParamsToUrlQuery(new URLSearchParams('__proto__=1'))

    expect(query.hasOwnProperty('__proto__')).toBe(true)
    expect(query.hasOwnProperty('a')).toBe(false)
  })

  it('round-trips prototype-shadowing names back into search params', () => {
    const search = '__proto__=1&constructor=2&a=3'

    expect(
      urlQueryToSearchParams(
        searchParamsToUrlQuery(new URLSearchParams(search))
      ).toString()
    ).toBe(new URLSearchParams(search).toString())
  })
})
