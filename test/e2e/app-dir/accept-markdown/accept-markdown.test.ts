import path from 'node:path'
import { readFileSync } from 'node:fs'
import { FileRef, isNextStart, nextTestSetup } from 'e2e-utils'

const MD = 'text/markdown; charset=utf-8'
const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

const layout = new FileRef(path.join(__dirname, 'app/layout.tsx'))

const mdxDependencies = {
  '@next/mdx': 'workspace:*',
  '@mdx-js/loader': '^3.1.1',
  '@mdx-js/react': '^3.1.1',
  '@types/mdx': '^2.0.13',
}

const varyEntries = (res: Response) =>
  (res.headers.get('vary') ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
const varyIncludesAccept = (res: Response) =>
  varyEntries(res).includes('accept')

const EXPECTED_MISSING = [
  { type: 'header', key: 'rsc' },
  { type: 'header', key: 'next-router-prefetch' },
  { type: 'header', key: 'next-router-segment-prefetch' },
  { type: 'header', key: 'next-action' },
  { type: 'query', key: '_rsc' },
  { type: 'cookie', key: '__prerender_bypass' },
]

type ManifestRewrite = {
  source: string
  destination: string
  has?: Array<{ type: string; key?: string; value?: string }>
  missing?: Array<{ type: string; key?: string; value?: string }>
}

const isGenerated = (r: ManifestRewrite) =>
  r.destination.endsWith('.md') &&
  r.has?.some((h) => h.type === 'header' && h.key === 'accept')

// `experimental.acceptMarkdown` doesn't generate content with Cache Components
// (covered separately below), and deployments aren't tested by this spike.
// @force-gate !cacheComponents && !deploy
describe('accept-markdown', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
      public: new FileRef(path.join(__dirname, 'public')),
      'mdx-components.tsx': new FileRef(
        path.join(__dirname, 'mdx-components.tsx')
      ),
      'next.config.ts': new FileRef(path.join(__dirname, 'next.config.ts')),
    },
    dependencies: mdxDependencies,
  })

  const get = (pathname: string, accept?: string, init: RequestInit = {}) =>
    next.fetch(pathname, {
      ...init,
      headers: { ...(accept ? { accept } : {}), ...(init.headers as any) },
    })

  it('serves a string export to markdown requests', async () => {
    const md = await get('/static', 'text/markdown')
    expect(md.status).toBe(200)
    expect(md.headers.get('content-type')).toBe(MD)
    expect(await md.text()).toBe('# Static page\n\nHello *agents*.\n')
  })

  it('serves function exports per generated param', async () => {
    for (const slug of ['first', 'second']) {
      const res = await get(`/posts/${slug}`, 'text/markdown')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe(MD)
      expect(await res.text()).toBe(`# Post ${slug}\n`)
    }
    const missing = await get('/posts/third', 'text/markdown')
    expect(missing.status).toBe(404)
  })

  it('only serves alternates for params generated along the route', async () => {
    // `section` comes from the layout's generateStaticParams, `topic` from the page's.
    const generated = await get('/guides/intro/setup', 'text/markdown')
    expect(generated.headers.get('content-type')).toBe(MD)
    expect(await generated.text()).toBe('# intro/setup\n')

    const notGenerated = await get('/guides/other/setup', 'text/markdown')
    expect(notGenerated.headers.get('content-type')).toMatch(/text\/html/)
    expect(await notGenerated.text()).toContain('Guide')
  })

  it('serves an empty string export', async () => {
    const res = await get('/empty', 'text/markdown')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe('')
  })

  it('serves the root page alternate', async () => {
    const res = await get('/', 'text/markdown')
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe('# Home\n')
  })

  // A single test rather than `it.each`, so the suite's `@force-gate` covers it.
  it('negotiates the Accept header', async () => {
    const cases: Array<[accept: string, isMarkdown: boolean]> = [
      ['text/markdown', true],
      ['text/markdown, text/html;q=0.9', true],
      ['text/html, text/markdown', true],
      ['text/html, text/markdown;q=0.5', true],
      ['TEXT/MARKDOWN', true],
      ['text/markdown; charset=utf-8', true],
      ['text/markdown;Q=1', true],
      ['text/markdown;q=0.001', true],
      ['text/markdown;q=0.10', true],
      ['text/markdown;q=.500', true],
      ['text/markdown;q=0, text/markdown', true],
      ['text/markdown;q=0, text/html', false],
      ['text/markdown;q=0.0', false],
      ['text/markdown; q = 0', false],
      ['text/markdown;charset=utf-8;q=0.000', false],
      ['text/x-markdown', false],
      ['text/markdownx', false],
      ['text/*', false],
      ['*/*', false],
      [BROWSER_ACCEPT, false],
    ]
    const results: Array<[string, boolean]> = []
    for (const [accept] of cases) {
      const res = await get('/static', accept)
      expect(res.status).toBe(200)
      results.push([accept, res.headers.get('content-type') === MD])
    }
    expect(results).toEqual(cases)
  })

  it('answers HEAD with markdown headers and no body', async () => {
    const res = await get('/static', 'text/markdown', { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe('')
  })

  it('never serves markdown to router, RSC, action or draft requests', async () => {
    const enable = await next.fetch('/enable-draft')
    const draftCookie = (enable.headers.get('set-cookie') ?? '').split(';')[0]
    expect(draftCookie).toContain('__prerender_bypass=')

    const excluded: Array<[label: string, res: Response]> = [
      ['rsc', await get('/static', 'text/markdown', { headers: { rsc: '1' } })],
      [
        'prefetch',
        await get('/static', 'text/markdown', {
          headers: { 'next-router-prefetch': '1' },
        }),
      ],
      [
        'segment prefetch',
        await get('/static', 'text/markdown', {
          headers: { 'next-router-segment-prefetch': '/_tree' },
        }),
      ],
      ['_rsc query', await get('/static?_rsc=abcde', 'text/markdown')],
      [
        'draft mode',
        await get('/static', 'text/markdown', {
          headers: { cookie: draftCookie },
        }),
      ],
      [
        'server action',
        await get('/static', 'text/markdown', {
          method: 'POST',
          headers: { 'next-action': 'abc' },
        }),
      ],
    ]
    const served = excluded
      .filter(([, res]) => res.headers.get('content-type') === MD)
      .map(([label]) => label)
    expect(served).toEqual([])
  })

  it('serves alternates at .md URLs regardless of Accept', async () => {
    const cases: Array<[pathname: string, body: string]> = [
      ['/static.md', '# Static page\n\nHello *agents*.\n'],
      ['/posts/first.md', '# Post first\n'],
      ['/index.md', '# Home\n'],
    ]
    for (const [pathname, body] of cases) {
      for (const accept of [undefined, BROWSER_ACCEPT]) {
        const res = await get(pathname, accept)
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toBe(MD)
        expect(await res.text()).toBe(body)
      }
    }
  })

  it('returns 404 for .md URLs without an alternate', async () => {
    for (const pathname of ['/plain.md', '/posts/third.md', '/posts/new.md']) {
      const res = await get(pathname)
      expect(res.status).toBe(404)
    }
  })

  it('serves HTML only when a public file owns the .md URL', async () => {
    const page = await get('/taken', 'text/markdown')
    expect(page.headers.get('content-type')).toMatch(/text\/html/)
    expect(await page.text()).toContain('Taken page')
    expect(varyIncludesAccept(page)).toBe(false)

    const file = await get('/taken.md')
    expect(await file.text()).toBe('# Public taken file\n')
  })

  it('serves HTML only for Edge runtime pages', async () => {
    const page = await get('/edge', 'text/markdown')
    expect(page.headers.get('content-type')).toMatch(/text\/html/)
    expect(await page.text()).toContain('Edge page')

    const md = await get('/edge.md')
    expect(md.status).toBe(404)
    expect(await md.text()).not.toContain('Edge page')
  })

  it('matches generated paths literally', async () => {
    for (const name of ['c(d)', 'e*f']) {
      const negotiated = await get(`/literal/${name}`, 'text/markdown')
      expect(negotiated.headers.get('content-type')).toBe(MD)
      expect(await negotiated.text()).toBe(`# Literal ${name}\n`)

      const direct = await get(`/literal/${name}.md`)
      expect(await direct.text()).toBe(`# Literal ${name}\n`)
    }
    // Not a pattern: `c(d)` must not match `cd`.
    expect((await get('/literal/cd', 'text/markdown')).status).toBe(404)
  })

  it('keeps HTML for static siblings without an export', async () => {
    const res = await get('/posts/new', 'text/markdown')
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(await res.text()).toContain('New post form')
  })

  it('keeps HTML for other requests and varies on Accept', async () => {
    for (const accept of [undefined, BROWSER_ACCEPT]) {
      const res = await get('/static', accept)
      expect(res.headers.get('content-type')).toMatch(/text\/html/)
      expect(await res.text()).toContain('Static page')
      expect(varyIncludesAccept(res)).toBe(true)
    }
  })

  it('serves HTML without Vary: Accept for pages without an alternate', async () => {
    const res = await get('/plain', 'text/markdown')
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(await res.text()).toContain('plain page')
    expect(varyIncludesAccept(res)).toBe(false)
  })

  it('serves MDX source byte-for-byte', async () => {
    const res = await get('/mdx', 'text/markdown')
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe(await next.readFile('app/mdx/page.mdx'))

    const html = await get('/mdx', BROWSER_ACCEPT)
    expect(await html.text()).toContain('Rendered only in HTML')
  })

  it('prefers an authored markdown export in MDX', async () => {
    const res = await get('/mdx-custom', 'text/markdown')
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe('# Authored markdown\n')
  })

  if (isNextStart) {
    it('varies both representations on Accept and the RSC headers', async () => {
      const md = await get('/static', 'text/markdown')
      const html = await get('/static', BROWSER_ACCEPT)
      for (const res of [md, html]) {
        expect(varyEntries(res)).toEqual(
          expect.arrayContaining(['accept', 'rsc'])
        )
      }
      expect(md.headers.get('cache-control')).toBe(
        html.headers.get('cache-control')
      )
      const direct = await get('/static.md')
      expect(varyEntries(direct)).toEqual(
        expect.arrayContaining(['accept', 'rsc'])
      )
    })

    it('generates one beforeFiles rewrite per alternate path', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )
      const beforeFiles: ManifestRewrite[] = manifest.rewrites.beforeFiles
      const generated = beforeFiles.filter(isGenerated)

      expect(generated.map((r) => [r.source, r.destination]).sort()).toEqual(
        [
          ['/', '/index.md'],
          ['/empty', '/empty.md'],
          ['/guides/intro/setup', '/guides/intro/setup.md'],
          // Sources escape pattern characters; destinations percent-encode them.
          ['/literal/c\\(d\\)', '/literal/c%28d%29.md'],
          ['/literal/e\\*f', '/literal/e%2Af.md'],
          ['/mdx', '/mdx.md'],
          ['/mdx-custom', '/mdx-custom.md'],
          ['/overridden', '/overridden.md'],
          ['/posts/first', '/posts/first.md'],
          ['/posts/second', '/posts/second.md'],
          ['/static', '/static.md'],
        ].sort()
      )
      for (const rule of generated) {
        expect(rule.has).toEqual([
          { type: 'header', key: 'accept', value: expect.any(String) },
        ])
        expect(rule.missing).toEqual(EXPECTED_MISSING)
      }

      // The user's own rule comes first.
      const userIndex = beforeFiles.findIndex(
        (r) => r.source === '/overridden' && r.destination === '/static'
      )
      expect(userIndex).toBeGreaterThanOrEqual(0)
      expect(userIndex).toBeLessThan(beforeFiles.indexOf(generated[0]))
    })

    // `beforeFiles` rewrites chain: the user's rule runs first and decides
    // the target, so `/overridden`'s own alternate is never used. The
    // generated rule for the user's destination (`/static`) then applies.
    it('lets an earlier user beforeFiles rewrite win', async () => {
      const res = await get('/overridden', 'text/markdown')
      expect(res.headers.get('content-type')).toBe(MD)
      expect(await res.text()).toBe('# Static page\n\nHello *agents*.\n')

      const html = await get('/overridden', BROWSER_ACCEPT)
      expect(await html.text()).toContain('Static page')
    })

    // Dev doesn't render the page for Markdown requests, so it can't know the
    // page calls notFound(); production skips the alternate at build time.
    it('keeps the status of pages that prerender as not found', async () => {
      const res = await get('/gone', 'text/markdown')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type') ?? '').not.toBe(MD)
      expect((await get('/gone.md')).status).toBe(404)
    })

    it('prerenders alternates and does not call markdown() at runtime', async () => {
      const calls = await next.readFile('markdown-calls.log')
      expect(calls.split('\n').filter(Boolean).sort()).toEqual([
        'first',
        'second',
      ])
      await get('/posts/first', 'text/markdown')
      await get('/posts/second.md')
      expect(await next.readFile('markdown-calls.log')).toBe(calls)
    })
  }
})

describe('accept-markdown flag off', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'fixtures/flag-off/app')),
      'app/layout.tsx': layout,
    },
  })

  it('ignores markdown exports', async () => {
    const res = await next.fetch('/', { headers: { accept: 'text/markdown' } })
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(await res.text()).toContain('flag off')
    expect(varyIncludesAccept(res)).toBe(false)
    expect((await next.fetch('/index.md')).status).toBe(404)
  })

  it('does not validate markdown exports', async () => {
    const res = await next.fetch('/invalid', {
      headers: { accept: 'text/markdown' },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('invalid export ignored')
  })

  if (isNextStart) {
    it('generates no rewrites', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )
      expect(manifest.rewrites.beforeFiles.filter(isGenerated)).toEqual([])
    })
  }
})

// `experimental.acceptMarkdown` is unsupported with Cache Components: the
// build warns and serves HTML only.
// @force-gate cacheComponents && !deploy
describe('accept-markdown with Cache Components', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'fixtures/cache-components/app')),
      'app/layout.tsx': layout,
      'next.config.js': `module.exports = { experimental: { acceptMarkdown: true } }`,
    },
  })

  it('serves HTML only', async () => {
    const res = await next.fetch('/static', {
      headers: { accept: 'text/markdown' },
    })
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(varyIncludesAccept(res)).toBe(false)
    expect((await next.fetch('/static.md')).status).toBe(404)
  })

  if (isNextStart) {
    it('warns and generates no rewrites', async () => {
      expect(next.cliOutput).toContain(
        '`experimental.acceptMarkdown` will not generate content for `cacheComponents`'
      )
      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )
      expect(manifest.rewrites.beforeFiles.filter(isGenerated)).toEqual([])
    })
  }
})

// Build-time diagnostics and outputs only exist for `next build`.
// @force-gate start && !cacheComponents
describe('accept-markdown build', () => {
  const config = (extra = '') =>
    `module.exports = { ${extra} experimental: { acceptMarkdown: true } }`

  describe('headers() in markdown()', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/headers-misuse/app')),
        'app/layout.tsx': layout,
        'next.config.js': config(),
      },
      skipStart: true,
    })

    it('fails the build naming the page', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('acceptMarkdown')
      expect(cliOutput).toMatch(/"\/"|route "\/"|page "\/"/)
    })
  })

  describe('markdown export on a dynamic page', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/force-dynamic/app')),
        'app/layout.tsx': layout,
        'next.config.js': config(),
      },
      skipStart: true,
    })

    it('fails the build naming the page', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('acceptMarkdown')
      expect(cliOutput).toMatch(/"\/"|route "\/"|page "\/"/)
    })
  })

  describe('dynamic segment without generated paths', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(
          path.join(__dirname, 'fixtures/no-generated-params/app')
        ),
        'app/layout.tsx': layout,
        'next.config.js': config(),
      },
      skipStart: true,
    })

    it('fails the build naming the page', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('acceptMarkdown')
      expect(cliOutput).toContain('page "/[slug]"')
    })
  })

  describe("output: 'export'", () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/output-export/app')),
        'app/layout.tsx': layout,
        'next.config.js': config(`output: 'export',`),
      },
      skipStart: true,
    })

    it('warns and still builds the HTML', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(0)
      expect(cliOutput).toContain(
        "`experimental.acceptMarkdown` will not generate content for `output: 'export'`"
      )
      expect(await next.readFile('out/index.html')).toContain('output export')
      await expect(next.readFile('out/index.md')).rejects.toThrow()
    })
  })

  describe('collisions', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/collision/app')),
        public: new FileRef(path.join(__dirname, 'fixtures/collision/public')),
        'app/layout.tsx': layout,
        'next.config.js': config(),
      },
    })

    it('skips the alternate, warns, and keeps the public file', async () => {
      expect(next.cliOutput).toContain('acceptMarkdown')
      expect(next.cliOutput).toContain('/collide.md')
      expect(next.cliOutput).toContain('public/collide.md')

      const file = await next.fetch('/collide.md')
      expect(await file.text()).toBe('# Public file\n')

      const page = await next.fetch('/collide', {
        headers: { accept: 'text/markdown' },
      })
      expect(page.headers.get('content-type')).toMatch(/text\/html/)

      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )
      expect(manifest.rewrites.beforeFiles.filter(isGenerated)).toEqual([])
    })

    it('skips alternates whose .md URL is a user route', async () => {
      expect(next.cliOutput).toContain('"/notes"')
      expect(next.cliOutput).toContain('the route "/notes.md"')

      const route = await next.fetch('/notes.md')
      expect(await route.text()).toBe('# User notes route\n')

      const page = await next.fetch('/notes', {
        headers: { accept: 'text/markdown' },
      })
      expect(page.headers.get('content-type')).toMatch(/text\/html/)
      expect(await page.text()).toContain('Notes page')
    })
  })

  // webpack can't build a literal `app/index` page next to the root page
  // (missing client reference manifest for "/index"), independent of
  // `experimental.acceptMarkdown`.
  // @force-gate !webpack
  describe('root and /index collision', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/root-index/app')),
        'app/layout.tsx': layout,
        'next.config.js': config(),
      },
    })

    it('skips both alternates when / and /index claim /index.md', async () => {
      expect(next.cliOutput).toContain('"/index.md"')
      for (const [pathname, body] of [
        ['/', 'Root page'],
        ['/index', 'Literal index page'],
      ]) {
        const page = await next.fetch(pathname, {
          headers: { accept: 'text/markdown' },
        })
        expect(page.headers.get('content-type')).toMatch(/text\/html/)
        expect(await page.text()).toContain(body)
      }
      expect((await next.fetch('/index.md')).status).toBe(404)
    })
  })

  describe('basePath', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/base-path/app')),
        'app/layout.tsx': layout,
        'next.config.js': config(`basePath: '/base',`),
      },
    })

    it('generates basePath-aware rewrites and .md URLs', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )
      expect(
        manifest.rewrites.beforeFiles
          .filter(isGenerated)
          .map((r: ManifestRewrite) => [r.source, r.destination])
      ).toEqual([['/base/static', '/base/static.md']])

      const negotiated = await next.fetch('/base/static', {
        headers: { accept: 'text/markdown' },
      })
      expect(negotiated.headers.get('content-type')).toBe(MD)
      expect(await negotiated.text()).toBe('# Base path page\n')

      const direct = await next.fetch('/base/static.md')
      expect(direct.headers.get('content-type')).toBe(MD)
      expect(await direct.text()).toBe('# Base path page\n')
    })
  })

  describe('adapter outputs', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/adapter/app')),
        'app/layout.tsx': layout,
        'recording-adapter.js': new FileRef(
          path.join(__dirname, 'fixtures/adapter/recording-adapter.js')
        ),
        'next.config.js': config(
          `adapterPath: require.resolve('./recording-adapter.js'),`
        ),
      },
      skipStart: true,
    })

    it('hands adapters generic rewrites and prerender outputs', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      const recorded = JSON.parse(await next.readFile('adapter-output.json'))

      const rules = recorded.beforeFiles.filter((r: { destination?: string }) =>
        r.destination?.endsWith('.md')
      )
      expect(rules).toEqual([
        expect.objectContaining({
          source: '/static',
          destination: '/static.md',
          missing: EXPECTED_MISSING,
        }),
      ])

      const md = recorded.prerenders.find(
        (p: { pathname: string }) => p.pathname === '/static.md'
      )
      expect(md).toBeDefined()
      expect(md.initialHeaders['content-type']).toBe(MD)
      expect(md.initialHeaders.vary.toLowerCase()).toContain('accept')
      expect(readFileSync(md.filePath, 'utf8')).toBe('# Adapter page\n')

      const html = recorded.prerenders.find(
        (p: { pathname: string }) => p.pathname === '/static'
      )
      expect(html.initialHeaders.vary.toLowerCase()).toContain('accept')
    })
  })

  describe('adapter outputs with the flag off', () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'fixtures/adapter/app')),
        'app/layout.tsx': layout,
        'recording-adapter.js': new FileRef(
          path.join(__dirname, 'fixtures/adapter/recording-adapter.js')
        ),
        'next.config.js': `module.exports = { adapterPath: require.resolve('./recording-adapter.js') }`,
      },
      skipStart: true,
    })

    it('emits no Markdown rewrites, outputs or Vary', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      const recorded = JSON.parse(await next.readFile('adapter-output.json'))
      expect(
        recorded.beforeFiles.filter((r: { destination?: string }) =>
          r.destination?.endsWith('.md')
        )
      ).toEqual([])
      expect(
        recorded.prerenders.filter((p: { pathname: string }) =>
          p.pathname.endsWith('.md')
        )
      ).toEqual([])
      const html = recorded.prerenders.find(
        (p: { pathname: string }) => p.pathname === '/static'
      )
      expect(html.initialHeaders.vary.toLowerCase()).not.toContain('accept')
    })
  })
})
