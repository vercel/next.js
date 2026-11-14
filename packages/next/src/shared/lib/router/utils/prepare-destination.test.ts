import { parseDestination, prepareDestination } from './prepare-destination'

describe('prepareDestination', () => {
  it('should compile params in the hash', () => {
    const result = prepareDestination({
      appendParamsToQuery: false,
      destination: '/docs/status-codes#:code',
      params: { code: '404' },
      query: {},
    })

    expect(result.newUrl).toBe('/docs/status-codes#404')
    expect(result.parsedDestination.pathname).toBe('/docs/status-codes')
    expect(result.parsedDestination.hash).toBe('#404')
  })

  it('should keep pattern characters in the hash literal', () => {
    // `?`, `(`, `)` etc. are path-to-regexp modifiers in a path, but in the
    // hash they are plain characters, e.g. for hash-based routing
    const result = prepareDestination({
      appendParamsToQuery: false,
      destination: 'https://example.com/#/login?return=:slug&mode=(full)',
      params: { slug: 'account' },
      query: {},
    })

    expect(result.newUrl).toBe('/#/login?return=account&mode=(full)')
    expect(result.parsedDestination.hostname).toBe('example.com')
    expect(result.parsedDestination.pathname).toBe('/')
    expect(result.parsedDestination.hash).toBe(
      '#/login?return=account&mode=(full)'
    )
  })

  it('should not append params to the query that are used in the hash', () => {
    const result = prepareDestination({
      appendParamsToQuery: true,
      destination: '/docs#:section',
      params: { section: 'install' },
      query: {},
    })

    expect(result.parsedDestination.hash).toBe('#install')
    expect(result.parsedDestination.query).toEqual({})
  })
})

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
