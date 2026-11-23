import { parseDestination, prepareDestinationURL } from './prepare-destination'

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

describe('prepareDestinationURL', () => {
  it('keeps routing query data separate from the destination search', () => {
    const { parsedDestination } = prepareDestinationURL({
      destination: '/target?item=one&item=two',
      params: { slug: 'hello' },
      query: { item: 'original', original: 'value' },
      appendParamsToQuery: true,
    })
    expect(parsedDestination.kind).toBe('relative')
    expect(parsedDestination.url.pathname).toBe('/target')
    expect(parsedDestination.url.searchParams.getAll('item')).toEqual([
      'one',
      'two',
    ])
    expect(parsedDestination.url.searchParams.has('slug')).toBe(false)
    expect(parsedDestination.query).toEqual({
      item: ['one', 'two'],
      original: 'value',
      slug: 'hello',
    })
  })

  it('interpolates hostname templates before constructing the final authority', () => {
    const { parsedDestination } = prepareDestinationURL({
      destination: 'https://:sub.example.org/:slug?q=:slug',
      params: { sub: 'API', slug: 'hello' },
      query: {},
      appendParamsToQuery: true,
    })
    expect(parsedDestination.kind).toBe('absolute')
    if (parsedDestination.kind !== 'absolute')
      throw new Error('Expected absolute destination')
    expect(parsedDestination.url.href).toBe(
      'https://api.example.org/hello?q=hello'
    )
    expect(parsedDestination.query).toEqual({ q: 'hello' })
  })
})
