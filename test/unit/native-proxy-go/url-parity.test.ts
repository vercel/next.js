/**
 * proxy.go must receive the same URL as proxy.ts. In adapter builds the Go
 * handler reimplements the JavaScript adapter's URL normalization, so this
 * compares the compiled Go handler with `adapter()` on generated URLs.
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
	"strings"
)

const nextGoTrustInternalHeaders = false

func Proxy(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("x-url", r.RequestURI)
	w.Header().Set("x-path", r.URL.Path)
	Next(w)
}

type testCase struct {
	Path string
}

func main() {
	var cases []testCase
	if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
		panic(err)
	}
	results := make([]*[2]string, len(cases))
	for i, c := range cases {
		raw := "GET " + c.Path + " HTTP/1.1\\r\\nHost: example.test\\r\\n"
		r, err := http.ReadRequest(bufio.NewReader(strings.NewReader(raw + "\\r\\n")))
		if err != nil {
			// net/http rejects the request before it reaches Proxy.
			continue
		}
		w := httptest.NewRecorder()
		nextGoHandler()(w, r)
		requestURI, path := w.Header().Get("x-url"), w.Header().Get("x-path")
		// URL.Path must be the decoded form of the path in RequestURI.
		escapedPath, _, _ := strings.Cut(requestURI, "?")
		if unescaped, err := url.PathUnescape(escapedPath); err != nil || unescaped != path {
			path = "inconsistent URL.Path " + path
		}
		results[i] = &[2]string{requestURI, path}
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		panic(err)
	}
}
`

// Pages Router data URLs (/_next/data/<build ID>/<page>.json) are left out:
// proxy.go only supports App Router applications, which do not serve them, so
// it does not normalize them like proxy.ts does.
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

describe('proxy.go request URLs', () => {
  let directory: string
  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'proxy-go-url-parity-'))
  })
  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it.each([false, true])(
    'match proxy.ts with skipProxyUrlNormalize %s',
    async (skipProxyUrlNormalize) => {
      const variant = join(directory, `skip-${skipProxyUrlNormalize}`)
      mkdirSync(variant)
      writeFileSync(join(variant, 'go.mod'), 'module proxy\n\ngo 1.22\n')
      writeFileSync(join(variant, 'main.go'), harness)
      // Mirrors go_proxy_handler_source in crates/next-api/src/app.rs.
      writeFileSync(
        join(variant, 'handler.go'),
        template.replace(
          'const nextGoSkipProxyURLNormalize = false',
          `const nextGoSkipProxyURLNormalize = ${skipProxyUrlNormalize}`
        )
      )
      const binary = join(
        variant,
        process.platform === 'win32' ? 'harness.exe' : 'harness'
      )
      execFileSync(process.env.TURBOPACK_GO || 'go', ['build', '-o', binary], {
        cwd: variant,
        env: { ...process.env, CGO_ENABLED: '0' },
        stdio: 'inherit',
      })

      const cases = generateCases()
      const goResults: Array<[string, string] | null> = JSON.parse(
        execFileSync(binary, {
          input: JSON.stringify(cases.map((path) => ({ Path: path }))),
          maxBuffer: 64 * 1024 * 1024,
        }).toString()
      )

      // basePath and trailingSlash do not change the URL proxy.ts receives
      // for App Router requests, so the Go handler does not need them.
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
        for (const nextConfig of configs) {
          compared++
          const expected = await proxyTsURL(
            path,
            nextConfig,
            skipProxyUrlNormalize
          )
          if (go[0] !== expected || go[1].startsWith('inconsistent')) {
            mismatches.push({ path, nextConfig, expected, go })
          }
        }
      }
      expect(mismatches.slice(0, 20)).toEqual([])
      expect(compared).toBeGreaterThan(cases.length)
    },
    120_000
  )
})
