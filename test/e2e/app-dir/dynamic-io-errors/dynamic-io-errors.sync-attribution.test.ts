import { nextTestSetup } from 'e2e-utils'

import { createExpectError } from './utils'

function runTests(options: { withMinification: boolean }) {
  const { withMinification } = options
  describe(`Dynamic IO Errors - ${withMinification ? 'With Minification' : 'Without Minification'}`, () => {
    describe('Error Attribution with Sync IO - Guarded RSC with guarded Client sync IO', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files:
          __dirname +
          '/fixtures/sync-attribution/guarded-async-guarded-clientsync',
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

      it('should not error the build sync IO is used inside a Suspense Boundary in a client Component and nothing else is dynamic', async () => {
        try {
          await next.start()
        } catch {
          throw new Error('expected build not to fail')
        }
        expect(next.cliOutput).toContain('◐ / ')
      })
    })
    describe('Error Attribution with Sync IO - Guarded RSC with unguarded Client sync IO', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files:
          __dirname +
          '/fixtures/sync-attribution/guarded-async-unguarded-clientsync',
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

      it('should error the build with a reason related to sync IO access', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Error: Route "/" used `new Date()` inside a Client Component without a Suspense boundary above it.'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })
    describe('Error Attribution with Sync IO - Unguarded RSC with guarded Client sync IO', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files:
          __dirname +
          '/fixtures/sync-attribution/unguarded-async-guarded-clientsync',
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

      it('should error the build with a reason related dynamic data', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Error: Route "/": A component accessed data, headers, params, searchParams, or a short-lived cache without a Suspense boundary nor a "use cache" above it.'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })
    describe('Error Attribution with Sync IO - unguarded RSC with unguarded Client sync IO', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files:
          __dirname +
          '/fixtures/sync-attribution/unguarded-async-unguarded-clientsync',
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

      it('should error the build with a reason related to sync IO access', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Error: Route "/" used `new Date()` inside a Client Component without a Suspense boundary above it.'
        )
        expectError('Error occurred prerendering page "/"')
      })
    })
  })
}

runTests({ withMinification: true })
runTests({ withMinification: false })
