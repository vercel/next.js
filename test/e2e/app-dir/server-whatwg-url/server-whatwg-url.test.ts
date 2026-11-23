import { nextTestSetup } from 'e2e-utils'

describe('server WHATWG URLs', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('preserves query precedence and repeated values across rewrite chains', async () => {
    const $ = await next.render$('/url-chain/hello?item=original&keep=a%2Bb')
    const query = JSON.parse($('#result').text())
    expect(query.item).toEqual(['dest1', 'dest2'])
    expect(query.fixed).toBe('a/b')
    expect(query.keep).toBe('a+b')
    expect(query.captured).toBe('hello')
  })

  it('matches query conditions against the last repeated value', async () => {
    const $ = await next.render$('/url-condition?item=first&item=last')
    expect(JSON.parse($('#result').text()).matched).toBe('yes')
    expect(
      (await next.fetch('/url-condition?item=last&item=first')).status
    ).toBe(404)
  })

  it('keeps Pages routing parameters separate from the resolved URL', async () => {
    const $ = await next.render$(
      '/url-query/hello?item=one&item=two&encoded=a%2Fb'
    )
    const result = JSON.parse($('#result').text())
    expect(result.query).toEqual({
      slug: 'hello',
      added: 'hello world',
      item: ['one', 'two'],
      encoded: 'a/b',
    })
    const resolved = new URL(result.resolvedUrl, 'http://example.org')
    expect(resolved.pathname).toBe('/query')
    expect(resolved.searchParams.has('slug')).toBe(false)
    expect(resolved.searchParams.getAll('item')).toEqual(['one', 'two'])
  })

  it('serializes redirects without a dummy origin or double encoding', async () => {
    const response = await next.fetch(
      '/url-redirect/hello?keep=a%2Bb&item=one&item=two',
      { redirect: 'manual' }
    )
    expect(response.status).toBe(307)
    const location = response.headers.get('location')!
    const destination = new URL(location, next.url)
    expect(destination.origin).toBe(new URL(next.url).origin)
    expect(destination.pathname).toBe('/echo')
    expect(destination.searchParams.get('value')).toBe('hello')
    expect(destination.searchParams.get('encoded')).toBe('a/b')
    expect(destination.searchParams.get('keep')).toBe('a+b')
    expect(destination.searchParams.getAll('item')).toEqual(['one', 'two'])
    expect(location).not.toContain('http://n/')
  })
})
