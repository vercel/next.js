import { FileRef, nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'

const srcHeader = 'X-From-Src-Middleware'
const rootHeader = 'X-From-Root-Middleware'

describe('middleware-src', () => {
  if (isNextDev) {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
    })

    describe('Middleware in src/ folder', () => {
      it('loads and runs src middleware', async () => {
        const response = await next.fetch('/post-1')
        expect(response.headers.has(srcHeader)).toBe(false)
        expect(response.headers.has(`${srcHeader}-TS`)).toBe(true)
      })
    })

    describe('Middleware in src/ and / folders', () => {
      beforeAll(async () => {
        const pagesContent = await next.readFile('src/pages/index.js')
        await next.patchFile('pages/index.js', pagesContent)
        await next.patchFile(
          'middleware.js',
          await next.readFile('root/middleware.js')
        )
        await next.patchFile(
          'middleware.ts',
          await next.readFile('root/middleware.ts')
        )
        // Webpack needs a restart to resolve newly added root middleware.
        // Turbopack picks up the change while the dev server is running.
        if (!isTurbopack) {
          await next.stop()
          await next.start()
        }
      })

      afterAll(async () => {
        await next.deleteFile('pages/index.js').catch(() => {})
        await next.deleteFile('middleware.js').catch(() => {})
        await next.deleteFile('middleware.ts').catch(() => {})
      })

      it('loads and runs only root middleware', async () => {
        await retry(async () => {
          const response = await next.fetch('/post-1')
          expect(response.headers.has(srcHeader)).toBe(false)
          expect(response.headers.has(`${srcHeader}-TS`)).toBe(false)
          expect(response.headers.has(rootHeader)).toBe(false)
          expect(response.headers.has(`${rootHeader}-TS`)).toBe(true)
        })
      })
    })
  } else {
    describe.each([
      ['src/ folder', false],
      ['src/ and / folders', true],
    ])('Middleware in %s', (_name, withRootMiddleware) => {
      const { next, isNextDeploy } = nextTestSetup({
        files: {
          src: new FileRef(join(__dirname, 'src')),
          ...(withRootMiddleware && {
            'pages/index.js': new FileRef(
              join(__dirname, 'src/pages/index.js')
            ),
            'middleware.js': new FileRef(join(__dirname, 'root/middleware.js')),
            'middleware.ts': new FileRef(join(__dirname, 'root/middleware.ts')),
          }),
        },
        nextConfig: {
          output: 'export',
          // Static export does not support Cache Components. Disable the
          // dependent cached navigations flag too, since CI enables both.
          cacheComponents: false,
          experimental: { cachedNavigations: false },
        },
        skipStart: true,
      })

      it('should warn about middleware on export', async () => {
        if (isNextDeploy) {
          await next.start()
        } else {
          // A static export builds successfully but cannot use `next start`.
          const { exitCode } = await next.build()
          expect(exitCode).toBe(0)
        }
        expect(next.cliOutput).toContain(
          'Statically exporting a Next.js application via `next export` disables API routes and middleware.'
        )
      }, 240_000)
    })
  }
})
