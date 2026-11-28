/**
 * proxy.go receives the same URL as proxy.ts, except where proxy.ts would
 * authorize a different resource from the one the App Router handler uses.
 * The Go handler reimplements the JavaScript adapter's URL normalization, so
 * this compares the compiled Go handler with `adapter()` on generated URLs and
 * asserts the stricter cases separately.
 */
import { adapter } from 'next/dist/server/web/adapter'
import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const template = readFileSync(
  join(__dirname, '../../../crates/next-api/src/templates/go_proxy_handler.go'),
  'utf8'
)

// Reports the URL that Proxy receives, as an adapter-built executable would.
const harness = `package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const nextGoTrustInternalHeaders = false

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-url", r.RequestURI)
	w.Header().Set("x-path", r.URL.Path)
	// What proxy.Next(w) from next/go/proxy sets; the harness builds without
	// a Go module, so it cannot import the SDK.
	w.Header().Set("x-middleware-next", "1")
}

type testCase struct {
	Path string
}

func main() {
	var cases []testCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	results := make([]*[3]string, len(cases))
	for i, c := range cases {
		raw := "GET " + c.Path + " HTTP/1.1\\r\\nHost: example.test\\r\\n"
		r, err := http.ReadRequest(bufio.NewReader(strings.NewReader(raw + "\\r\\n")))
		if err != nil {
			// net/http rejects the request before it reaches Proxy.
			continue
		}
		w := httptest.NewRecorder()
		NextInternalGoHandler(nextGoTrustInternalHeaders)(w, r)
		requestURI, path := w.Header().Get("x-url"), w.Header().Get("x-path")
		// URL.Path must be the decoded form of the path in RequestURI.
		escapedPath, _, _ := strings.Cut(requestURI, "?")
		if unescaped, err := url.PathUnescape(escapedPath); err != nil || unescaped != path {
			path = "inconsistent URL.Path " + path
		}
		results[i] = &[3]string{requestURI, path, strconv.Itoa(w.Code)}
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		panic(err)
	}
}
`

// Reserved Pages data URLs are tested separately: proxy.go rejects them
// instead of forwarding them to an App Router catch-all handler.
function generateCases(): string[] {
  const prefixes = ['', '/docs', '/docsx']
  const middles = [
    '',
    '/en',
    '/index',
    '/%5Fnext/data/build',
    '/a%2Fb',
    '/a%20b',
    '/caf%C3%A9',
    '/x/..',
    '/x/%2E%2E',
    '/x/.%2e/y',
    '/x/.',
    '//double',
    '/a\\b',
    // `^` is left out: whether the WHATWG URL parser percent-encodes it in
    // paths depends on the Node.js version, so proxy.ts itself differs.
    '/a|b',
    '/a[b]',
    "/a'b",
  ]
  const suffixes = [
    '',
    '/',
    '/page',
    '/page/',
    '/page.rsc',
    '/page.rsc/',
    '/page.rsc?x=1',
    '/page?q=a.rsc',
    '/page?q=a.rsc?z',
    '/a.rsc.rsc',
    '/page%2Ersc',
    '/page.RSC',
    '/page.segments/_tree.segment.rsc',
    '/page.json',
    '/page/.json',
    '/index.json',
    '/index/page.json',
    '/page.json.json',
    '.rsc',
    '.json',
    '/page?',
    '/page.rsc?',
    '/page?_rsc=abc',
    '/page?_rsc=a&b=2&_rsc=c',
    '/page?nxtPslug=a',
    '/page?nxtPa=1&a=0&nxtPa=2',
    '/page?nxtIx=1&nxtP=2&nxtPnxtIy=3',
    '/page?a+b=c%20d&e',
    '/page?%E2%82=1&%FF=%C3%A9',
    '/page?a=%zz&b=%2',
    `/page?x='"`,
    '/page?&&a=&=b',
  ]
  const cases: string[] = []
  for (const prefix of prefixes) {
    for (const middle of middles) {
      for (const suffix of suffixes) {
        cases.push(prefix + middle + suffix || '/')
      }
    }
  }
  return cases
}

// proxy.go rejects a path that still matches the RSC suffix after its
// transport suffix is removed. App Router decodes route params and strips that
// suffix again, so Proxy would authorize a different resource.
function hasRSCSegment(url: string) {
  return url
    .split('?', 1)[0]
    .split('/')
    .some((segment) => {
      try {
        const decoded = decodeURIComponent(segment)
        return decoded.endsWith('.rsc') || decoded.includes('.rsc?')
      } catch {
        return true
      }
    })
}

// proxy.ts reparses suffix-exposed dot segments before Proxy runs. proxy.go
// rejects them because downstream Go routing receives the original URL.
function hasRSCExposedDotSegment(path: string) {
  const pathname = new URL('http://example.test' + path).pathname
  const segmentIndex = pathname.lastIndexOf('.segments/')
  const withoutSuffix =
    pathname.endsWith('.segment.rsc') && segmentIndex > 0
      ? pathname.slice(0, segmentIndex)
      : pathname.replace(/\.rsc$/, '')
  return (
    new URL('http://example.test' + withoutSuffix).pathname !== withoutSuffix
  )
}

// proxy.go keeps query values ending in .rsc, does not promote client nxtP and
// nxtI names, and authorizes segment prefetches as their page. proxy.ts does
// none of these. These cases are asserted separately.
function isStricterThanProxyTs(path: string) {
  const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : ''
  return (
    query.includes('.rsc') ||
    /(^|&)nxt[PI]/.test(query) ||
    path.includes('.segment.rsc')
  )
}

async function proxyTsURL(
  path: string,
  nextConfig: { basePath?: string; trailingSlash?: boolean },
  skipProxyUrlNormalize: boolean
) {
  let received: string | undefined
  await adapter({
    page: 'middleware',
    skipProxyUrlNormalize,
    handler: async (request) => {
      received = request.url.slice(new URL(request.url).origin.length)
      return new Response(null, { headers: { 'x-middleware-next': '1' } })
    },
    request: {
      url: 'http://example.test' + path,
      headers: { host: 'example.test' },
      method: 'GET',
      nextConfig,
      signal: new AbortController().signal,
    },
  })
  return received
}

type GoResult = [url: string, pathname: string, status: string] | null

function buildHarness(
  directory: string,
  skip: boolean,
  basePath = '',
  trustInternalHeaders = false
) {
  mkdirSync(directory)
  writeFileSync(join(directory, 'go.mod'), 'module proxy\n\ngo 1.22\n')
  writeFileSync(
    join(directory, 'main.go'),
    harness.replace(
      'const nextGoTrustInternalHeaders = false',
      `const nextGoTrustInternalHeaders = ${trustInternalHeaders}`
    )
  )
  writeFileSync(
    join(directory, 'handler.go'),
    template
      .replace('__NEXT_GO_PACKAGE__', 'main')
      .replace(
        'const nextGoSkipProxyURLNormalize = false',
        `const nextGoSkipProxyURLNormalize = ${skip}`
      )
      .replace(
        'const nextGoProxyBasePath = ""',
        `const nextGoProxyBasePath = ${JSON.stringify(basePath)}`
      )
  )
  const binary = join(
    directory,
    process.platform === 'win32' ? 'harness.exe' : 'harness'
  )
  execFileSync(process.env.TURBOPACK_GO || 'go', ['build', '-o', binary], {
    cwd: directory,
    env: { ...process.env, CGO_ENABLED: '0' },
    stdio: 'inherit',
  })
  return binary
}

function runHarness(binary: string, paths: string[]): GoResult[] {
  return JSON.parse(
    execFileSync(binary, {
      input: JSON.stringify(paths.map((Path) => ({ Path }))),
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15_000,
    }).toString()
  )
}

describe('proxy.go request URLs', () => {
  let directory: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'proxy-go-url-parity-'))
  })
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it.each([false, true])(
    'match proxy.ts or reject ambiguous RSC paths with skipProxyUrlNormalize %s',
    async (skipProxyUrlNormalize) => {
      const binary = buildHarness(
        join(directory, `skip-${skipProxyUrlNormalize}`),
        skipProxyUrlNormalize
      )

      const cases = generateCases()
      const goResults = runHarness(binary, cases)

      // basePath and trailingSlash do not change ordinary App Router URLs.
      // Reserved data-path rejection with a basePath is tested separately.
      const configs = [
        {},
        { trailingSlash: true },
        { basePath: '/docs' },
        { basePath: '/docs', trailingSlash: true },
      ]
      const mismatches: unknown[] = []
      let compared = 0
      for (const [i, path] of cases.entries()) {
        const go = goResults[i]
        if (!go) continue
        const exposesDotSegment = hasRSCExposedDotSegment(path)
        for (const nextConfig of configs) {
          compared++
          const expected = await proxyTsURL(
            path,
            nextConfig,
            skipProxyUrlNormalize
          )
          const rejected = go[2] === '404'
          if (
            rejected !== (exposesDotSegment || hasRSCSegment(expected ?? ''))
          ) {
            mismatches.push({ path, nextConfig, expected, go })
          } else if (
            !rejected &&
            !isStricterThanProxyTs(path) &&
            (go[0] !== expected || go[1].startsWith('inconsistent'))
          ) {
            mismatches.push({ path, nextConfig, expected, go })
          }
        }
      }
      expect(mismatches.slice(0, 20)).toEqual([])
      expect(compared).toBeGreaterThan(cases.length)
    },
    120_000
  )

  it.each([false, true])(
    'rejects reserved data URLs with normalization skipped: %s',
    (skip) => {
      for (const basePath of ['', '/docs']) {
        const binary = buildHarness(
          join(directory, `reserved-${skip}-${basePath.length}`),
          skip,
          basePath
        )
        const paths = [
          '/_next/data/build/private.json',
          '/_next/data/build/private.json.rsc',
          '/_next/data/build/private.json.segments/_tree.segment.rsc',
        ]
        for (const prefix of new Set(['', basePath])) {
          expect(
            runHarness(
              binary,
              paths.map((path) => prefix + path)
            ).map((result) => result?.[2])
          ).toEqual(['404', '404', '404'])
        }
      }
    },
    120_000
  )

  it('preserves client queries and handles large duplicate queries in bounded work', () => {
    const binary = buildHarness(join(directory, 'security'), false)
    const paths = [
      '/page?resource=public.rsc',
      '/page?resource=private&nxtPresource=public',
      '/page?resource=private&nxtIresource=public',
      '/page?nxtPresource=public',
      '/page?resource=public&value=1&value=2',
      '/page?' + 'value=1&'.repeat(3000) + 'resource=public',
      '/page?value=' + 'a'.repeat(64 * 1024 - 'value='.length),
      '/page?' + 'value=1&'.repeat(4095) + 'value=1',
    ]
    const results = runHarness(binary, paths)
    expect(results.map((result) => result?.[0])).toEqual(paths)
    const oversizedQueries = [
      '/page?value=' + 'a'.repeat(64 * 1024),
      '/page?' + 'value=1&'.repeat(30_000),
      '/page?' + '&'.repeat(4096),
    ]
    expect(
      runHarness(binary, oversizedQueries).map((result) => result?.[2])
    ).toEqual(['414', '414', '414'])
  }, 120_000)

  it.each([false, true])(
    'authorizes the resource the App Router handler uses with normalization skipped: %s',
    (skip) => {
      const binary = buildHarness(join(directory, `stricter-${skip}`), skip)
      const cases: Array<[path: string, url: string | null]> = [
        ['/page?q=a.rsc', '/page?q=a.rsc'],
        ['/page?q=a.rsc?z', skip ? '/page?q=a.rsc?z' : '/page?q=a.rsc%3Fz'],
        ['/page?nxtPslug=a&slug=b', '/page?nxtPslug=a&slug=b'],
        ['/page?nxtIslug=a', '/page?nxtIslug=a'],
        ['/page.segments/_tree.segment.rsc', '/page'],
        ['/page.segments/$c$children/__PAGE__.segment.rsc', '/page'],
        ['/a/private.rsc', '/a/private'],
        ['/a/private/page...rsc', '/a/private/page..'],
        ['/a/private/....rsc', '/a/private/...'],
        // Rejected: suffix removal must not expose a dot segment that reparsing
        // resolves before Proxy authorizes the request.
        ['/a/private/...rsc', null],
        ['/a/private/..rsc', null],
        ['/a/private/.%2e.rsc', null],
        ['/a/private/%2e..rsc', null],
        ['/a/private/%2e%2e.rsc', null],
        ['/a/private/%2E%2E.rsc', null],
        ['/a/private/..segments/_tree.segment.rsc', null],
        ['/a/private/...segments/_tree.segment.rsc', null],
        ['/a/private/.%2e.segments/_tree.segment.rsc', null],
        ['/a/private/%2e.segments/_tree.segment.rsc', null],
        ['/a/private/%2e..segments/_tree.segment.rsc', null],
        ['/a/private/%2e%2e.segments/_tree.segment.rsc', null],
        ['/a/private/%2E%2E.segments/_tree.segment.rsc', null],
        // Rejected: the handler would receive private or private.rsc.
        ['/a/private%2Ersc', null],
        ['/a/private%2ersc', null],
        ['/a/private.rsc.rsc', null],
        ['/a/private.rsc%2Ersc', null],
        ['/a/private.rsc/', null],
        ['/a/x%2Ersc/b', null],
        ['/a/x.rsc%3Fy', null],
        ['/page.segments/_tree.segment.rsc.rsc', null],
        // Rejected: Go handlers parse query fields after a literal #, which
        // proxy.ts drops as a fragment, so Proxy would not see them.
        ['/page?resource=public#&resource=private', null],
        ['/page#?resource=private', null],
        ['/page#frag', null],
      ]
      const results = runHarness(
        binary,
        cases.map(([path]) => path)
      )
      expect(
        cases.map(([path], i) => [
          path,
          results[i]?.[2] === '404' ? null : results[i]?.[0],
        ])
      ).toEqual(cases)
    },
    120_000
  )

  it('normalizes the URL a trusted Next.js server forwards exactly once', () => {
    const binary = buildHarness(join(directory, 'trusted'), true, '/docs', true)
    const paths = [
      '/_next/data/build/private.json',
      '/docs/_next/data/build/private.json',
      '/docs/_next/data/build/private.json.rsc',
      '/page?' + '&'.repeat(4096),
      '/docs/a/private%2Ersc',
      '/docs/a/private.rsc.rsc',
      '/docs/a/private/...rsc',
      '/docs/a/private/%2e%2e.rsc',
      '/docs/a/private/...segments/_tree.segment.rsc',
      '/docs/a/private.rsc',
    ]
    expect(
      runHarness(binary, paths).map((result) => [result?.[2], result?.[0]])
    ).toEqual([
      ['404', ''],
      ['404', ''],
      ['404', ''],
      ['414', ''],
      ['404', ''],
      ['404', ''],
      ['404', ''],
      ['404', ''],
      ['404', ''],
      ['200', '/docs/a/private'],
    ])
  }, 120_000)
})
