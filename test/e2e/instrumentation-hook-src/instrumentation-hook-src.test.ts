import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
describe('instrumentation-hook-rsc', () => {
  describe('instrumentation', () => {
    const { next, isNextDev, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should run the instrumentation hook', async () => {
      await next.render('/')
      await retry(
        () => {
          expect(next.cliOutput).toMatch(/instrumentation hook/)
        },
        30000,
        1000
      )
    })
    it('should not overlap with a instrumentation page', async () => {
      const page = await next.render('/instrumentation')
      expect(page).toContain('Hello')
    })
    it('should run the edge instrumentation compiled version with the edge runtime', async () => {
      await next.render('/edge')
      await retry(
        () => {
          expect(next.cliOutput).toMatch(/instrumentation hook on the edge/)
        },
        30000,
        1000
      )
    })
    if (isNextDev) {
      // TODO: Implement handling for changing the instrument file.
      it.skip('should reload the server when the instrumentation hook changes', async () => {
        await next.render('/')
        await next.patchFile(
          './src/instrumentation.js',
          `export function register() {console.log('toast')}`
        )
        await retry(
          () => {
            expect(next.cliOutput).toMatch(/toast/)
          },
          30000,
          1000
        )
        await next.renameFile(
          './src/instrumentation.js',
          './src/instrumentation.js.bak'
        )
        await retry(
          () => {
            expect(next.cliOutput).toMatch(
              /The instrumentation file has been removed/
            )
          },
          30000,
          1000
        )
        await next.patchFile(
          './src/instrumentation.js.bak',
          `export function register() {console.log('bread')}`
        )
        await next.renameFile(
          './src/instrumentation.js.bak',
          './src/instrumentation.js'
        )
        await retry(
          () => {
            expect(next.cliOutput).toMatch(/The instrumentation file was added/)
          },
          30000,
          1000
        )
        await retry(
          () => {
            expect(next.cliOutput).toMatch(/bread/)
          },
          30000,
          1000
        )
      })
    }
  })
})
