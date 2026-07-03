import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'
import { promises as fs } from 'fs'

// `output: 'export'` writes static files during `next build` and has no server,
// so every route must be fully static. The dev server enforces the same rules
// so problems surface early. Each case runs in both modes: `start` inspects the
// build result and exported files, `dev` drives the dev server. A static export
// has no server to deploy, so deploy runs are skipped.
const skipStart = process.env.NEXT_TEST_MODE !== 'dev'

function fixture(name: string) {
  return join(__dirname, 'fixtures', name)
}

async function exportedHtml(testDir: string, path: string) {
  const name = path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`
  return fs.readFile(join(testDir, 'out', name), 'utf8')
}

// Assertions shared by every non-static case: the message names the route as not
// exportable, and never suggests the "wrap in <Suspense>" / `instant = false`
// mitigations — neither can help an export, which has no server to fill a hole.
function expectFailedExport(cliOutput: string) {
  expect(cliOutput).toContain('could not be statically exported')
  expect(cliOutput).not.toContain('wrap-in-or-move-into-suspense')
}

describe('cache-components-output-export', () => {
  describe('fully cached page', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('static'),
      skipStart,
      skipDeployment: true,
    })

    it('exports the cached content', async () => {
      if (isNextStart) {
        expect((await next.build()).exitCode).toBe(0)
        expect(await exportedHtml(next.testDir, '/')).toContain(
          'hello-from-use-cache'
        )
      } else {
        expect(await next.render('/')).toContain('hello-from-use-cache')
      }
    })
  })

  describe('cached page with a lifetime', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('cached-with-lifetime'),
      skipStart,
      skipDeployment: true,
    })

    // A `use cache` value with `cacheLife` exports frozen at build time; there
    // is no server to revalidate it.
    it('exports the cached content', async () => {
      if (isNextStart) {
        expect((await next.build()).exitCode).toBe(0)
        expect(await exportedHtml(next.testDir, '/')).toContain(
          'cached-with-lifetime'
        )
      } else {
        expect(await next.render('/')).toContain('cached-with-lifetime')
      }
    })
  })

  describe('client-only dynamic (useSearchParams) inside a Suspense boundary', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('search-params-suspense'),
      skipStart,
      skipDeployment: true,
    })

    // Client-only dynamic doesn't need a server — the static shell exports and
    // the client fills the hook after hydration. The server result stays static,
    // so this must NOT be treated as a failed export.
    it('exports the static shell', async () => {
      if (isNextStart) {
        expect((await next.build()).exitCode).toBe(0)
        expect(await exportedHtml(next.testDir, '/')).toContain('static shell')
      } else {
        expect(await next.render('/')).toContain('static shell')
      }
    })
  })

  describe('client-only dynamic (useSearchParams) outside a Suspense boundary', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('search-params-unwrapped'),
      skipStart,
      skipDeployment: true,
    })

    // Without a Suspense boundary the hook blocks the static shell — same rule
    // as Cache Components, and the same error, whose advice (wrap in
    // `<Suspense>`) genuinely fixes it for an export.
    it('fails the build and reports the hook in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(
          'in a Client Component outside of `<Suspense>`'
        )
      } else {
        await next.render('/')
        await retry(() => {
          expect(next.cliOutput).toContain(
            'in a Client Component outside of `<Suspense>`'
          )
        })
      }
    })
  })

  describe('dynamic route with generateStaticParams', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('dynamic-params'),
      skipStart,
      skipDeployment: true,
    })

    it('exports every concrete param', async () => {
      if (isNextStart) {
        expect((await next.build()).exitCode).toBe(0)
        expect(await exportedHtml(next.testDir, '/blog/first')).toContain(
          'post-content-for-first'
        )
        expect(await exportedHtml(next.testDir, '/blog/second')).toContain(
          'post-content-for-second'
        )
      } else {
        expect(await next.render('/blog/first')).toContain(
          'post-content-for-first'
        )
        expect(await next.render('/blog/second')).toContain(
          'post-content-for-second'
        )
      }
    })
  })

  describe('dynamic route without generateStaticParams', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('dynamic-params-missing'),
      skipStart,
      skipDeployment: true,
    })

    // With no params to resolve, the only prerender entry is the fallback
    // shell, which an export skips — so nothing would be emitted and every URL
    // under the route would 404 on a static host. The build must fail, and the
    // dev server rejects params that `generateStaticParams` didn't provide.
    it('fails the build and errors in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expect(cliOutput).toContain('is missing "generateStaticParams()"')
      } else {
        expect(await next.render('/blog/anything')).toContain(
          'is missing param'
        )
      }
    })
  })

  describe('multi-page app', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('navigation'),
      skipStart,
      skipDeployment: true,
    })

    it('exports both routes and emits per-route navigation data', async () => {
      if (isNextStart) {
        expect((await next.build()).exitCode).toBe(0)
        const outDir = join(next.testDir, 'out')
        expect(await exportedHtml(next.testDir, '/')).toContain('Home')
        expect(await exportedHtml(next.testDir, '/about')).toContain(
          'About page content'
        )
        // Route RSC payload + segment-tree data the client router uses to
        // navigate without a server.
        expect(await fs.readFile(join(outDir, 'about.txt'), 'utf8')).toContain(
          'About page content'
        )
        await fs.access(join(outDir, 'about/__next._tree.txt'))
      } else {
        expect(await next.render('/')).toContain('Home')
        expect(await next.render('/about')).toContain('About page content')
      }
    })
  })

  describe('request data (cookies)', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('request-data'),
      skipStart,
      skipDeployment: true,
    })

    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
        // The build can't always pin the exact cause, so it uses the generic
        // wording (dev, below, reports the specific "used request data").
        expect(cliOutput).toContain('accessed data at request time')
      } else {
        await next.render('/')
        await retry(() => {
          expectFailedExport(next.cliOutput)
          expect(next.cliOutput).toContain('used request data')
        })
      }
    })
  })

  describe('request data inside a Suspense boundary', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('request-data-suspense'),
      skipStart,
      skipDeployment: true,
    })

    // A dynamic access behind `<Suspense>` resolves after the static stage.
    // There's no server to fill the hole, so it fails at the access site with
    // the same per-cause message as an unwrapped access.
    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
      } else {
        await next.render('/')
        await retry(() => {
          expectFailedExport(next.cliOutput)
          expect(next.cliOutput).toContain('used request data')
        })
      }
    })
  })

  describe('uncached I/O inside a Suspense boundary', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('dynamic-hole'),
      skipStart,
      skipDeployment: true,
    })

    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
      } else {
        await next.render('/')
        await retry(() => {
          expectFailedExport(next.cliOutput)
          expect(next.cliOutput).toContain('read uncached data')
        })
      }
    })
  })

  describe('private cache', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('private-cache'),
      skipStart,
      skipDeployment: true,
    })

    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
      } else {
        await next.render('/')
        await retry(() => expectFailedExport(next.cliOutput))
      }
    })
  })

  describe('dynamic generateMetadata', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('dynamic-metadata'),
      skipStart,
      skipDeployment: true,
    })

    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
      } else {
        await next.render('/')
        await retry(() => {
          expectFailedExport(next.cliOutput)
          expect(next.cliOutput).toContain('generateMetadata()')
        })
      }
    })
  })

  describe('dynamic generateViewport', () => {
    const { next, isNextStart } = nextTestSetup({
      files: fixture('dynamic-viewport'),
      skipStart,
      skipDeployment: true,
    })

    it('fails the build and reports the access in dev', async () => {
      if (isNextStart) {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).toBe(1)
        expectFailedExport(cliOutput)
      } else {
        await next.render('/')
        await retry(() => {
          expectFailedExport(next.cliOutput)
          expect(next.cliOutput).toContain('generateViewport()')
        })
      }
    })
  })
})
