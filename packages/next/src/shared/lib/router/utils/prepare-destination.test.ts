import type { IncomingMessage } from 'http'
import { parseDestination, matchHas } from './prepare-destination'

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

describe('matchHas', () => {
  it('should handle a has with an empty string value', () => {
    let req = {
      headers: {
        'x-now-route-matches': '',
      },
    } as unknown as IncomingMessage

    let result = matchHas(
      req,
      {},
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
          value: '',
        },
      ],
      []
    )

    expect(result).toEqual({})

    result = matchHas(
      req,
      {},
      [],
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
          value: '',
        },
      ]
    )

    expect(result).toEqual(false)

    // Remove the header entirely.
    delete req.headers['x-now-route-matches']

    result = matchHas(
      req,
      {},
      [],
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
          value: '',
        },
      ]
    )

    expect(result).toEqual({})

    result = matchHas(
      req,
      {},
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
          value: '',
        },
      ],
      []
    )

    expect(result).toEqual(false)
  })

  it('should handle a has without a value', () => {
    let req = {
      headers: {
        'x-now-route-matches': '',
      },
    } as unknown as IncomingMessage

    let result = matchHas(
      req,
      {},
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
        },
      ],
      []
    )

    expect(result).toEqual({
      xnowroutematches: '',
    })

    result = matchHas(
      req,
      {},
      [],
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
        },
      ]
    )

    expect(result).toEqual(false)

    // Remove the header entirely.
    delete req.headers['x-now-route-matches']

    result = matchHas(
      req,
      {},
      [],
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
        },
      ]
    )

    expect(result).toEqual({})

    result = matchHas(
      req,
      {},
      [
        {
          type: 'header',
          key: 'x-now-route-matches',
        },
      ],
      []
    )

    expect(result).toEqual(false)
  })
})
