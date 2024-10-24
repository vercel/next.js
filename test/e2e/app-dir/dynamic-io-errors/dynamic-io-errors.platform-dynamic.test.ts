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
  const { withMinification } = options
  describe(`Dynamic IO Errors - ${withMinification ? 'With Minification' : 'Without Minification'}`, () => {
    describe('Sync Dynamic - With Fallback - Math.random()', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-random-with-fallback',
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

      it('should not error the build when calling Math.random() if all dynamic access is inside a Suspense boundary', async () => {
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

    describe('Sync Dynamic - Without Fallback - Math.random()', () => {
      const { next, isNextDev, skipped } = nextTestSetup({
        files: __dirname + '/fixtures/sync-random-without-fallback',
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

      it('should error the build if Math.random() happens before some component outside a Suspense boundary is complete', async () => {
        try {
          await next.start()
        } catch {
          // we expect the build to fail
        }
        const expectError = createExpectError(next.cliOutput)

        expectError(
          'Error: Route "/" used `Math.random()` outside of `"use cache"` and without explicitly calling `await connection()` beforehand. See more info here: https://nextjs.org/docs/messages/next-prerender-random'
        )
        expectError('Error occurred prerendering page "/"')
        expectError('exiting the build.')
      })
    })
  })
}

runTests({ withMinification: true })
runTests({ withMinification: false })
