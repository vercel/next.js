import { nextTestSetup } from 'e2e-utils'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_2_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'

const PARSED_USER_AGENT = {
  ua: USER_AGENT,
  browser: { name: 'Chrome', version: '89.0.4389.90', major: '89' },
  engine: { name: 'Blink', version: '89.0.4389.90' },
  os: { name: 'Mac OS', version: '11.2.3' },
  device: { vendor: 'Apple', model: 'Macintosh' },
  cpu: {},
  isBot: false,
}

describe('next-server-user-agent', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Most code that imports `next/server` never calls `userAgent()`. The parser
  // builds its regular expressions when it is loaded, so it must not be loaded
  // before the first call.
  it('should not load the parser until userAgent() is called', async () => {
    const res = await next.fetch('/api/external', {
      headers: { 'user-agent': USER_AGENT },
    })
    expect(await res.json()).toEqual({
      parserLoadedOnImport: false,
      parserLoadedAfterCall: true,
      userAgent: PARSED_USER_AGENT,
    })
  })

  // These bundle `next/server`, so the parser has to load from inside the
  // bundle when it is first needed.
  it.each([
    { name: 'an App Router route handler', path: '/route-handler' },
    { name: 'an edge API route', path: '/api/edge' },
    { name: 'the proxy', path: '/proxy' },
  ])('should parse the user agent in $name', async ({ path }) => {
    const res = await next.fetch(path, {
      headers: { 'user-agent': USER_AGENT },
    })
    expect(await res.json()).toEqual(PARSED_USER_AGENT)
  })
})
