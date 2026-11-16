import path from 'node:path'
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

const varyIncludesAccept = (res: Response) =>
  (res.headers.get('vary') ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .includes('accept')

// `experimental.acceptMarkdown` doesn't generate content with Cache Components
// (out of scope for this spike), and routes-manifest/adapter outputs aren't
// emitted yet, so deployments can't serve the alternates.
// @force-gate !cacheComponents && !deploy
describe('accept-markdown', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(path.join(__dirname, 'app')),
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
    expect(varyIncludesAccept(md)).toBe(true)

    const html = await get('/static', BROWSER_ACCEPT)
    expect(md.headers.get('cache-control')).toBe(
      html.headers.get('cache-control')
    )
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

  it('keeps HTML for other requests and varies on Accept', async () => {
    for (const accept of [undefined, BROWSER_ACCEPT]) {
      const res = await get('/static', accept)
      expect(res.headers.get('content-type')).toMatch(/text\/html/)
      expect(await res.text()).toContain('Static page')
      expect(varyIncludesAccept(res)).toBe(true)
    }
  })

  it('serves HTML without Vary: Accept for pages without an alternate', async () => {
    const res = await get('/', 'text/markdown')
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
    expect(await res.text()).toContain('plain page')
    expect(varyIncludesAccept(res)).toBe(false)
  })

  // A single test rather than `it.each`, so the suite's `@force-gate` covers it.
  it('negotiates the Accept header', async () => {
    const cases: Array<[accept: string, isMarkdown: boolean]> = [
      ['text/markdown', true],
      ['text/markdown, text/html;q=0.9', true],
      ['text/html, text/markdown', true],
      ['text/html, text/markdown;q=0.5', false],
      ['text/markdown;q=0, text/html', false],
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

  it('never serves markdown to RSC or POST requests', async () => {
    const rsc = await get('/static', 'text/markdown', {
      headers: { rsc: '1' },
    })
    expect(rsc.headers.get('content-type')).toMatch(/text\/x-component/)

    const post = await get('/static', 'text/markdown', { method: 'POST' })
    expect(post.headers.get('content-type') ?? '').not.toBe(MD)
  })

  it('never serves markdown to router or cache-busted RSC requests', async () => {
    const prefetch = await get('/static', 'text/markdown', {
      headers: { 'next-router-prefetch': '1' },
    })
    expect(prefetch.headers.get('content-type') ?? '').not.toBe(MD)

    const rscQuery = await get('/static?_rsc=abcde', 'text/markdown')
    expect(rscQuery.headers.get('content-type') ?? '').not.toBe(MD)
  })

  it('serves HTML in draft mode', async () => {
    const enable = await next.fetch('/enable-draft')
    const cookie = (enable.headers.get('set-cookie') ?? '').split(';')[0]
    expect(cookie).toContain('__prerender_bypass=')

    const res = await get('/static', 'text/markdown', { headers: { cookie } })
    expect(res.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('serves MDX source byte-for-byte', async () => {
    const res = await get('/mdx', 'text/markdown')
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe(await next.readFile('app/mdx/page.mdx'))

    const html = await get('/mdx', BROWSER_ACCEPT)
    const body = await html.text()
    expect(body).toContain('Rendered only in HTML')
  })

  it('prefers an authored markdown export in MDX', async () => {
    const res = await get('/mdx-custom', 'text/markdown')
    expect(res.headers.get('content-type')).toBe(MD)
    expect(await res.text()).toBe('# Authored markdown\n')
  })

  if (isNextStart) {
    // Dev doesn't render the page for Markdown requests, so it can't know the
    // page calls notFound(); production skips the alternate at build time.
    it('keeps the status of pages that prerender as not found', async () => {
      const res = await get('/gone', 'text/markdown')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type') ?? '').not.toBe(MD)
    })

    it('prerenders alternates and does not call markdown() at runtime', async () => {
      const calls = await next.readFile('markdown-calls.log')
      expect(calls.split('\n').filter(Boolean).sort()).toEqual([
        'first',
        'second',
      ])
      await get('/posts/first', 'text/markdown')
      await get('/posts/second', 'text/markdown')
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
  })

  it('does not validate markdown exports', async () => {
    const res = await next.fetch('/invalid', {
      headers: { accept: 'text/markdown' },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('invalid export ignored')
  })
})

// Build-time diagnostics only exist for `next build`.
// @force-gate start && !cacheComponents
describe('accept-markdown build diagnostics', () => {
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
      const html = await next.readFile('out/index.html')
      expect(html).toContain('output export')
    })
  })
})
