import { parseDestination, prepareDestination } from './prepare-destination'

describe('parseDestination', () => {
  it('should parse the destination', () => {
    const destination = '/hello/:name'
    const params = { name: 'world' }
    const query = { foo: 'bar' }

    const result = parseDestination({
      destination,
      params,
      query,
    })

    expect(result).toMatchInlineSnapshot(`
     {
       "auth": null,
       "hash": "",
       "host": null,
       "hostname": null,
       "href": "/hello/:name",
       "origin": undefined,
       "pathname": "/hello/:name",
       "port": null,
       "protocol": null,
       "query": {},
       "search": "",
       "slashes": null,
     }
    `)
  })

  it('should parse the destination with a hash', () => {
    const destination = 'https://o:foo.com/hello/:name#bar'
    const params = { name: 'world' }
    const query = { foo: 'bar' }

    const result = parseDestination({
      destination,
      params,
      query,
    })

    expect(result).toMatchInlineSnapshot(`
     {
       "auth": null,
       "hash": "#bar",
       "hostname": "o:foo.com",
       "href": "https://o:foo.com/hello/:name#bar",
       "origin": "https://o:foo.com",
       "pathname": "/hello/:name",
       "port": "",
       "protocol": "https:",
       "query": {},
       "search": "",
       "slashes": true,
     }
    `)
  })

  it('should parse the destination with a host', () => {
    const destination = 'https://o:foo.com/hello/:name?foo=:bar'
    const params = { name: 'world' }
    const query = { foo: 'bar' }

    const result = parseDestination({
      destination,
      params,
      query,
    })

    expect(result).toMatchInlineSnapshot(`
     {
       "auth": null,
       "hash": "",
       "hostname": "o:foo.com",
       "href": "https://o:foo.com/hello/:name?foo=:bar",
       "origin": "https://o:foo.com",
       "pathname": "/hello/:name",
       "port": "",
       "protocol": "https:",
       "query": {
         "foo": ":bar",
       },
       "search": "?foo=:bar",
       "slashes": true,
     }
    `)
  })
})

describe('prepareDestination interception repeating params', () => {
  it.each(['(.)', '(..)', '(...)', '(..)(..)'])(
    'should preserve slashes for catchalls adjacent to %s',
    (marker) => {
      const { parsedDestination } = prepareDestination({
        appendParamsToQuery: false,
        destination: `/photos/${marker}:nxtIslug+`,
        params: {
          nxtIslug: ['a', 'b'],
        },
        query: {},
      })

      expect(parsedDestination.pathname).toBe(`/photos/${marker}a/b`)
    }
  )

  it.each(['(.)', '(..)', '(...)', '(..)(..)'])(
    'should preserve suffixes for catchalls adjacent to %s',
    (marker) => {
      const { parsedDestination } = prepareDestination({
        appendParamsToQuery: false,
        destination: `/photos/${marker}:nxtIslug+.json`,
        params: {
          nxtIslug: ['a', 'b'],
        },
        query: {},
      })

      expect(parsedDestination.pathname).toBe(`/photos/${marker}a/b.json`)
    }
  )

  it('should leave non-adjacent repeating params unchanged', () => {
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: '/photos/(.)album/:nxtPslug+',
      params: {
        nxtPslug: ['a', 'b'],
      },
      query: {},
    })

    expect(parsedDestination.pathname).toBe('/photos/(.)album/a/b')
  })

  it('should leave inline-pattern params unchanged', () => {
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: '/photos/(.):slug(.*)',
      params: {
        slug: 'a/b',
      },
      query: {},
    })

    expect(parsedDestination.pathname).toBe('/photos/(.)a/b')
  })

  it('should only join the marker-adjacent param', () => {
    const params = {
      nxtIslug: ['a', 'b'],
      unrelated: ['x', 'y'],
    }

    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: '/photos/(.):nxtIslug+?copy=:nxtIslug',
      params,
      query: {},
    })

    expect(parsedDestination.query.copy).toBe('a/b')
    expect(params.nxtIslug).toEqual(['a', 'b'])
    expect(params.unrelated).toEqual(['x', 'y'])
  })

  it('should not append a compiled catchall param to the query', () => {
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: true,
      destination: '/photos/(.):nxtIslug+',
      params: {
        nxtIslug: ['a', 'b'],
      },
      query: {},
    })

    expect(parsedDestination.pathname).toBe('/photos/(.)a/b')
    expect(parsedDestination.query).not.toHaveProperty('nxtIslug')
  })
})
