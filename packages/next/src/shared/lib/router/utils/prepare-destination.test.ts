import { parseDestination } from './prepare-destination'

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
       "hash": "",
       "hostname": undefined,
       "href": "/hello/:name",
       "pathname": "/hello/:name",
       "query": {},
       "search": "",
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
       "hash": "#bar",
       "hostname": "o:foo.com",
       "href": "https://o:foo.com/hello/:name#bar",
       "pathname": "/hello/:name",
       "port": "",
       "protocol": "https:",
       "query": {},
       "search": "",
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
       "hash": "",
       "hostname": "o:foo.com",
       "href": "https://o:foo.com/hello/:name?foo=:bar",
       "pathname": "/hello/:name",
       "port": "",
       "protocol": "https:",
       "query": {
         "foo": ":bar",
       },
       "search": "?foo=:bar",
     }
    `)
  })
})
