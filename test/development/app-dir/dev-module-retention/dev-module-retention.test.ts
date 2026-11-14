import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe.each([true, false])(
  'chunk loading with server HMR %s',
  (serverHmr) => {
    const { next } = nextTestSetup({
      files: __dirname,
      startArgs: serverHmr ? [] : ['--no-server-fast-refresh'],
    })

    async function assertRoutes(
      revision: string,
      environment: string,
      chosen: string
    ) {
      for (const pathname of ['/api/value', '/api/legacy']) {
        const response = await next.fetch(pathname)
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ revision, environment, chosen })
        expect(response.headers.get('x-revision')).toBe(revision)
        expect(response.headers.get('x-environment')).toBe(environment)
      }
      expect(await next.render('/')).toContain(revision)
      expect(await next.render('/legacy')).toContain(revision)
    }

    it('updates shared modules in App Router, Pages Router, and middleware', async () => {
      await assertRoutes('initial-revision', 'initial-env', 'first')
      await next.patchFile(
        'lib/version.ts',
        "export const revision = 'updated-revision'",
        async () => {
          await retry(() =>
            assertRoutes('updated-revision', 'initial-env', 'first')
          )
        }
      )
      await retry(() =>
        assertRoutes('initial-revision', 'initial-env', 'first')
      )
    })

    // Webpack currently retains middleware's environment snapshot on this path.
    // @gate turbopack
    it('reloads routes and middleware when environment files change', async () => {
      await next.patchFile(
        '.env.development',
        'RETENTION_ENV=updated-env',
        async () => {
          await retry(() =>
            assertRoutes('initial-revision', 'updated-env', 'first')
          )
        }
      )
      await retry(() =>
        assertRoutes('initial-revision', 'initial-env', 'first')
      )
    })

    // Webpack currently keeps the previously resolved alias until a rebuild.
    // @gate turbopack
    it('resolves chunks after a forced tsconfig reload', async () => {
      await next.patchFile(
        'tsconfig.json',
        (content) => content.replace('./lib/first.ts', './lib/second.ts'),
        async () => {
          await retry(() =>
            assertRoutes('initial-revision', 'initial-env', 'second')
          )
        }
      )
      await retry(() =>
        assertRoutes('initial-revision', 'initial-env', 'first')
      )
    })
  }
)
