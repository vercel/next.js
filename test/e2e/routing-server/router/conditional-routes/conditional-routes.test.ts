import { nextTestSetup } from 'e2e-utils'
import cheerio from 'cheerio'
import { fetchViaRawHttp } from 'next-test-utils'

describe('documented custom route source and condition matching', () => {
  const { next } = nextTestSetup({ files: __dirname })
  // R07 — headers.mdx, redirects.mdx, rewrites.mdx: every `has` condition must
  // match, and every `missing` condition must not match.
  // Host conditions require connecting to the local listener independently of
  // the Host header; a deployment's frontend routes by that header first.
  // @force-gate !deploy
  describe('documented custom route condition conjunctions', () => {
    const cases: {
      name: string
      matches: boolean
      headers?: Record<string, string>
      omit?: string[]
      query?: string
    }[] = [
      {
        name: 'all required conditions and no forbidden conditions',
        matches: true,
      },
      {
        name: 'an alternate regex capture and nonmatching missing values',
        matches: true,
        headers: {
          'x-contract-token': 'alternate',
          cookie: 'session=active; blocked=false',
        },
        query: 'required=yes&disabled=false',
      },
      {
        name: 'an absent required header',
        matches: false,
        omit: ['x-contract-token'],
      },
      {
        name: 'a nonmatching required header',
        matches: false,
        headers: { 'x-contract-token': 'allowed-near-miss' },
      },
      { name: 'an absent required cookie', matches: false, omit: ['cookie'] },
      {
        name: 'a nonmatching required cookie',
        matches: false,
        headers: { cookie: 'session=inactive' },
      },
      {
        name: 'an absent required query',
        matches: false,
        query: 'unrelated=yes',
      },
      {
        name: 'a nonmatching required query',
        matches: false,
        query: 'required=yes-near-miss',
      },
      {
        name: 'a nonmatching required host',
        matches: false,
        headers: { host: 'condition.example.invalid' },
      },
      {
        name: 'a forbidden header',
        matches: false,
        headers: { 'x-contract-blocked': 'present' },
      },
      {
        name: 'a forbidden cookie',
        matches: false,
        headers: { cookie: 'session=active; blocked=true' },
      },
      {
        name: 'a forbidden query',
        matches: false,
        query: 'required=yes&disabled=true',
      },
      {
        name: 'a forbidden host that otherwise matches the required host pattern',
        matches: false,
        headers: { host: 'blocked.example' },
      },
    ]

    for (const kind of ['header', 'redirect', 'rewrite']) {
      it.each(cases)(
        `${kind}: $name`,
        async ({
          matches,
          headers: overrides,
          omit = [],
          query = 'required=yes',
        }) => {
          const headers: Record<string, string> = {
            host: 'condition.example',
            'x-contract-token': 'allowed',
            cookie: 'session=active',
            ...overrides,
          }
          for (const key of omit) delete headers[key]
          const response = await fetchViaRawHttp(
            next.url,
            `/conditions/${kind}?${query}`,
            { headers }
          )

          if (kind === 'redirect' && matches) {
            expect(response.status).toBe(307)
            const location = new URL(
              response.headers.get('location')!,
              next.url
            )
            expect(location.pathname).toBe('/')
            expect(location.searchParams.get('token')).toBe(
              headers['x-contract-token']
            )
            expect(location.searchParams.get('required')).toBe('yes')
          } else {
            expect(response.status).toBe(200)
            const $ = cheerio.load(await response.text())
            expect($('#destination').text()).toBe(
              kind === 'rewrite' && matches ? 'destination' : `original:${kind}`
            )
            if (kind === 'rewrite' && matches) {
              expect(JSON.parse($('#query').text())).toMatchObject({
                token: headers['x-contract-token'],
                required: 'yes',
              })
            }
          }
          if (kind === 'header') {
            expect(response.headers.get('x-contract-conjunction')).toBe(
              matches ? headers['x-contract-token'] : null
            )
          }
        }
      )
    }
  })

  // R06 — these examples use the public path-to-regexp source syntax documented on
  // headers, redirects, and rewrites, including anchored paths and escaped literals.
  describe('documented custom route source patterns', () => {
    const cases: {
      path: string
      pattern?: string
      capture?: string
      prefix?: string
    }[] = [
      { path: 'literal', pattern: 'literal' },
      { path: 'literal-extra' },
      { path: 'literal', prefix: '/archive' },
      { path: 'single/hello', pattern: 'named', capture: 'hello' },
      { path: 'single/hello/extra' },
      { path: 'many', pattern: 'wildcard' },
      { path: 'many/a/b', pattern: 'wildcard' },
      { path: 'many-extra/a' },
      { path: 'some/a', pattern: 'one-or-more', capture: 'a' },
      { path: 'some/a/b', pattern: 'one-or-more', capture: 'a/b' },
      { path: 'some' },
      { path: 'optional', pattern: 'optional' },
      { path: 'optional/a', pattern: 'optional' },
      { path: 'optional/a/b' },
      { path: 'digits/123', pattern: 'regex', capture: '123' },
      { path: 'digits/123x' },
      { path: 'english(default)/hello', pattern: 'escaped', capture: 'hello' },
      { path: 'englishdefault/hello' },
    ]

    for (const kind of ['header', 'redirect', 'rewrite']) {
      it.each(cases.map((testCase) => ({ prefix: '', ...testCase })))(
        `${kind}: matches only the documented source $prefix/patterns/${kind}/$path`,
        async ({ path, pattern, capture, prefix = '' }) => {
          const response = await next.fetch(
            `${prefix}/patterns/${kind}/${path}`,
            { redirect: 'manual' }
          )
          if (kind === 'header') {
            expect(response.status).toBe(200)
            expect(response.headers.get('x-contract-pattern')).toBe(
              pattern ?? null
            )
            expect(response.headers.get('x-contract-capture')).toBe(
              capture ?? null
            )
            const $ = cheerio.load(await response.text())
            expect($('#destination').text()).toBe('pattern fallback')
          } else if (pattern && kind === 'redirect') {
            expect(response.status).toBe(307)
            const destination = new URL(
              response.headers.get('location')!,
              next.url
            )
            expect(destination.pathname).toBe('/')
            expect(destination.searchParams.get('pattern')).toBe(pattern)
            expect(destination.searchParams.get('capture')).toBe(
              capture ?? null
            )
          } else {
            expect(response.status).toBe(200)
            const $ = cheerio.load(await response.text())
            expect($('#destination').text()).toBe(
              pattern ? 'destination' : 'pattern fallback'
            )
            if (pattern) {
              const query = JSON.parse($('#query').text())
              expect(query.pattern).toBe(pattern)
              if (capture !== undefined) expect(query.capture).toBe(capture)
            }
          }
        }
      )
    }
  })
})
