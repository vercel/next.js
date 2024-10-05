import { nextTestSetup } from 'e2e-utils'

const WITH_PPR = !!process.env.__NEXT_EXPERIMENTAL_PPR

const stackStart = /\s+at /

function createExpectError(cliOutput: string) {
  let cliIndex = 0
  return function expectError(
    containing: string,
    withStackContaining?: string
  ) {
    const initialCliIndex = cliIndex
    let lines = cliOutput.slice(cliIndex).split('\n')

    let i = 0
    while (i < lines.length) {
      let line = lines[i++] + '\n'
      cliIndex += line.length
      if (line.includes(containing)) {
        if (typeof withStackContaining !== 'string') {
          return
        } else {
          while (i < lines.length) {
            let stackLine = lines[i++] + '\n'
            if (!stackStart.test(stackLine)) {
              expect(stackLine).toContain(withStackContaining)
            }
            if (stackLine.includes(withStackContaining)) {
              return
            }
          }
        }
      }
    }

    expect(cliOutput.slice(initialCliIndex)).toContain(containing)
  }
}

function runTests(options: { withMinification: boolean }) {
  const isTurbopack = !!process.env.TURBOPACK
  const { withMinification } = options
  describe(`Dynamic IO Errors - ${withMinification ? 'With Minification' : 'Without Minification'}`, () => {
    describe('Sync Dynamic - With Fallback - client searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-client-search-with-fallback',
        skipStart: true,
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

        if (WITH_PPR) {
          expect(next.cliOutput).toContain('◐ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(2)
        } else {
          expect(next.cliOutput).toContain('ƒ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(2)
        }
      })
    })

    describe('Sync Dynamic - Without Fallback - client searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-client-search-without-fallback',
        skipStart: true,
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
          'Error: Route / used a synchronous Dynamic API: `searchParams.foo`, which caused this component to not finish rendering before the prerender completed and no fallback UI was defined.',
          // Turbopack doesn't support disabling minification yet
          withMinification || isTurbopack ? undefined : 'IndirectionTwo'
        )
        expectError('Error occurred prerendering page "/"')
        expectError(
          'Error: Route / used `searchParams.foo` while prerendering which caused some part of the page to be dynamic without a Suspense boundary above it defining a fallback UI.'
        )
        expectError('exiting the build.')
      })
    })

    describe('Sync Dynamic - With Fallback - server searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-server-search-with-fallback',
        skipStart: true,
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

        if (WITH_PPR) {
          expect(next.cliOutput).toContain('◐ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(2)
        } else {
          expect(next.cliOutput).toContain('ƒ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(0)
        }
      })
    })

    describe('Sync Dynamic - Without Fallback - server searchParams', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-server-search-without-fallback',
        skipStart: true,
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

        if (WITH_PPR) {
          expectError(
            'Error: Route / used a synchronous Dynamic API: `searchParams.foo`. This particular component may have been dynamic anyway or it may have just not finished before the synchronous Dynamic API was invoked.',
            // Turbopack doesn't support disabling minification yet
            withMinification || isTurbopack ? undefined : 'IndirectionTwo'
          )
        } else {
          expectError(
            'Error: Route / used a synchronous Dynamic API: `searchParams.foo`, which caused this component to not finish rendering before the prerender completed and no fallback UI was defined.',
            // Turbopack doesn't support disabling minification yet
            withMinification || isTurbopack ? undefined : 'IndirectionTwo'
          )
        }
        expectError('Error occurred prerendering page "/"')
        expectError(
          'Error: Route / used `searchParams.foo` while prerendering which caused some part of the page to be dynamic without a Suspense boundary above it defining a fallback UI.'
        )
        expectError('exiting the build.')
      })
    })

    describe('Sync Dynamic - With Fallback - cookies', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-cookies-with-fallback',
        skipStart: true,
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

        if (WITH_PPR) {
          expect(next.cliOutput).toContain('◐ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(2)
        } else {
          expect(next.cliOutput).toContain('ƒ / ')
          const $ = await next.render$('/')
          expect($('[data-fallback]').length).toBe(0)
        }
      })
    })

    describe('Sync Dynamic - Without Fallback - cookies', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-cookies-without-fallback',
        skipStart: true,
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

        if (WITH_PPR) {
          expectError(
            "Error: Route / used a synchronous Dynamic API: cookies().get('token'). This particular component may have been dynamic anyway or it may have just not finished before the synchronous Dynamic API was invoked.",
            // Turbopack doesn't support disabling minification yet
            withMinification || isTurbopack ? undefined : 'IndirectionTwo'
          )
        } else {
          expectError(
            "Error: Route / used a synchronous Dynamic API: cookies().get('token'), which caused this component to not finish rendering before the prerender completed and no fallback UI was defined.",
            // Turbopack doesn't support disabling minification yet
            withMinification || isTurbopack ? undefined : 'IndirectionTwo'
          )
        }
        expectError('Error occurred prerendering page "/"')
        expectError(
          "Error: Route / used cookies().get('token') while prerendering which caused some part of the page to be dynamic without a Suspense boundary above it defining a fallback UI."
        )
        expectError('exiting the build.')
      })
    })
  })
}

runTests({ withMinification: true })
runTests({ withMinification: false })
