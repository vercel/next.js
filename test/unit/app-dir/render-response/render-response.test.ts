import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'
import { NodeNextResponse } from 'next/dist/server/base-http/node'
import { WebNextResponse } from 'next/dist/server/base-http/web'
import { createPrerenderHeaders } from 'next/dist/server/app-render/render-response'

// Compare output with the transport semantics that prerendering previously used.
describe.each(['nodejs', 'edge'])('prerender headers (%s)', (runtime) => {
  const previousRuntime = process.env.NEXT_RUNTIME
  beforeEach(() => {
    process.env.NEXT_RUNTIME = runtime
  })
  afterEach(() => {
    if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME
    else process.env.NEXT_RUNTIME = previousRuntime
  })

  it('preserves seeded values, set/append behavior, and repeated values', () => {
    const response =
      runtime === 'edge'
        ? new WebNextResponse()
        : new NodeNextResponse(
            new ServerResponse(new IncomingMessage(new Socket()))
          )
    response.setHeader('Link', ['</a>; rel=preload', '</b>; rel=preload'])
    response.setHeader('Location', '/old')
    const output = createPrerenderHeaders(response.getHeaders())
    expect(output.headers).toEqual({})

    const operations: [
      'setHeader' | 'appendHeader',
      string,
      string | string[],
    ][] = [
      ['appendHeader', 'link', '</a>; rel=preload'],
      ['appendHeader', 'link', ['</c>; rel=preload', '</c>; rel=preload']],
      ['setHeader', 'location', '/new'],
      ['setHeader', 'link', ['</d>; rel=preload', '</e>; rel=preload']],
      ['appendHeader', 'link', '</e>; rel=preload'],
      ['setHeader', 'set-cookie', ['a=1; Path=/', 'b=2; Path=/']],
      ['appendHeader', 'set-cookie', 'a=1; Path=/'],
      ['setHeader', 'x-empty', []],
      ['appendHeader', 'x-empty', []],
      ['appendHeader', 'x-absent', []],
    ]
    for (const [method, name, value] of operations) {
      output[method](name, value)
      if (method === 'appendHeader') {
        for (const item of Array.isArray(value) ? value : [value]) {
          response.appendHeader(name, item)
        }
      } else {
        response.setHeader(name, value)
      }
      expect(output.headers[name]).toEqual(response.getHeader(name))
    }
  })

  it('records output independently of an ended response', () => {
    const seed = { link: ['</initial>; rel=preload'], location: '/stale' }
    const output = createPrerenderHeaders(seed)
    output.appendHeader('link', '</new>; rel=preload')
    output.setHeader('location', '/fresh')
    expect(output.headers.location).toBe('/fresh')
    expect(output.headers.link).toContain('</new>; rel=preload')
    expect(seed).toEqual({
      link: ['</initial>; rel=preload'],
      location: '/stale',
    })
  })
})
