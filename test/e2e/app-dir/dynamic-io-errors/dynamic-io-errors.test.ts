import { nextTestSetup } from 'e2e-utils'

import { createExpectError } from './utils'

function runTests(options: { withMinification: boolean }) {
  const isTurbopack = !!process.env.IS_TURBOPACK_TEST
  const { withMinification } = options
  describe(`Dynamic IO Errors - ${withMinification ? 'With Minification' : 'Without Minification'}`, () => {
    describe('Dynamic Metadata - Static Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-metadata-static-route',
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

      // This test used to assert the opposite but now that metadata is streaming during prerenders
      // we don't have to error the build when it is dynamic
      it('should error the build if generateMetadata is dynamic when the rest of the route is prerenderable', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Route "/" has a `generateMetadata` that depends on Request data (`cookies()`, etc...) or uncached external data (`fetch(...)`, etc...) when the rest of the route does not'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })
    describe('Dynamic Metadata - Error Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-metadata-error-route',
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

      // This test is just here because there was a bug when dynamic metadata was used alongside another dynamic IO violation which caused the validation to be skipped.
      it('should error the build for the correct reason when there is a dynamic IO violation alongside dynamic metadata', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })
    describe('Dynamic Metadata - Static Route With Suspense', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-metadata-static-with-suspense',
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

      // This test used to assert the opposite but now that metadata is streaming during prerenders
      // we don't have to error the build when it is dynamic
      it('should not error the build if generateMetadata is dynamic', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Route "/" has a `generateMetadata` that depends on Request data (`cookies()`, etc...) or uncached external data (`fetch(...)`, etc...) when the rest of the route does not'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })

    describe('Dynamic Metadata - Dynamic Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-metadata-dynamic-route',
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

      it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('#dynamic').text()).toBe('Dynamic')
        expect($('[data-fallback]').length).toBe(1)
      })
    })

    describe('Dynamic Viewport - Static Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-viewport-static-route',
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

      it('should error the build if generateViewport is dynamic', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Route "/" has a `generateViewport` that depends on Request data (`cookies()`, etc...) or uncached external data (`fetch(...)`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })

    describe('Dynamic Viewport - Dynamic Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-viewport-dynamic-route',
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

      it('should error the build if generateViewport is dynamic even if there are other uses of dynamic on the page', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Route "/" has a `generateViewport` that depends on Request data (`cookies()`, etc...) or uncached external data (`fetch(...)`, etc...) without explicitly allowing fully dynamic rendering. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })

    describe('Static Route', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/static',
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

      it('should not error the build when all routes are static', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
          throw new Error('expected build not to fail for fully static project')
        }
      })
    })

    describe('Dynamic Root', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-root',
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

        expectError(
          'Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.',
          // Turbopack doesn't support disabling minification yet
          withMinification || isTurbopack ? undefined : 'IndirectionTwo'
        )
        expectError(
          'Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.',
          // Turbopack doesn't support disabling minification yet
          withMinification || isTurbopack ? undefined : 'IndirectionThree'
        )
        expectError('Error occurred prerendering page "/"')
        expectError('exiting the build.')
      })
    })

    describe('Dynamic Boundary', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/dynamic-boundary',
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

      it('should partially prerender when all dynamic components are inside a Suspense boundary', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail for fully static project')
          // we expect the build to fail
        }

        expect(next.cliOutput).toContain('◐ / ')
        const $ = await next.render$('/')
        expect($('[data-fallback]').length).toBe(2)
      })
    })
  })
}

runTests({ withMinification: true })
runTests({ withMinification: false })
