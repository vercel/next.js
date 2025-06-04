import { nextTestSetup } from 'e2e-utils'

import { createExpectError } from './utils'

function runTests(options: { withMinification: boolean }) {
  const { withMinification } = options
  describe(`Dynamic IO Errors - ${withMinification ? 'With Minification' : 'Without Minification'}`, () => {
    describe('Sync Dynamic - With Fallback - client searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-client-search-with-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should not error the build when synchronously reading search params in a client component if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    })

    describe('Sync Dynamic - Without Fallback - client searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-client-search-without-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        // TODO we need to figure out a way to improve this error message. This is the rare case where the sync IO is escaping out of it's parent Suspense because something is rendering too slowly in the root. At the moment we don't have a way of discriminating between this and something like Request data access in the server.
        // expectError('Route "/" used `searchParams.foo`')
        expectError(
          'Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.'
        )
        expectError('Error occurred prerendering page "/"')
        expectError('exiting the build.')
      })
    })

    describe('Sync Dynamic - With Fallback - server searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-server-search-with-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should not error the build when synchronously reading search params in a client component if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    })

    describe('Sync Dynamic - Without Fallback - server searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-server-search-without-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError('Route "/" used `searchParams.foo`')
        expectError('Error occurred prerendering page "/"')
        expectError('exiting the build.')
      })
    })

    describe('Sync Dynamic - With Fallback - cookies', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-cookies-with-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should not error the build when synchronously reading search params in a client component if all dynamic access is inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    })

    describe('Sync Dynamic - Without Fallback - cookies', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-cookies-without-fallback',
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      if (isNextDev) {
        it('does not run in dev', () => {})
        return
      }

      beforeEach(async () => {
        if (!withMinification) {
          await next.patchFile('next.config.js', (content) =>
            content.replace(
              'serverMinification: true,',
              'serverMinification: false,'
            )
          )
        }
      })

      it('should error the build if dynamic IO happens in the root (outside a Suspense)', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError('Route "/" used `cookies().get(\'token\')`')
        expectError('Error occurred prerendering page "/"')
        expectError('exiting the build.')
      })
    })
  })
}

runTests({ withMinification: true })
runTests({ withMinification: false })
