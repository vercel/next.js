import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
describe('instrumentation-hook-rsc', () => {
  createNextDescribe(
    'instrumentation',
    {
      files: __dirname,
      nextConfig: {
        experimental: {
          instrumentationHook: true,
        },
      },
      skipDeployment: true,
    },
    ({ next, isNextDev }) => {
      it('should run the instrumentation hook', async () => {
        await next.render('/')
        await check(() => next.cliOutput, /instrumentation hook/)
      })
      it('should not overlap with a instrumentation page', async () => {
        const page = await next.render('/instrumentation')
        expect(page).toContain('Hello')
      })
      it('should run the edge instrumentation compiled version with the edge runtime', async () => {
        await next.render('/edge')
        await check(() => next.cliOutput, /instrumentation hook on the edge/)
      })
      if (isNextDev) {
        // TODO: Implement handling for changing the instrument file.
        it.skip('should reload the server when the instrumentation hook changes', async () => {
          await next.render('/')
          await next.patchFile(
            './src/instrumentation.js',
            `export function register() {console.log('toast')}`
          )
          await check(() => next.cliOutput, /toast/)
          await next.renameFile(
            './src/instrumentation.js',
            './src/instrumentation.js.bak'
          )
          await check(
            () => next.cliOutput,
            /The instrumentation file has been removed/
          )
          await next.patchFile(
            './src/instrumentation.js.bak',
            `export function register() {console.log('bread')}`
          )
          await next.renameFile(
            './src/instrumentation.js.bak',
            './src/instrumentation.js'
          )
          await check(
            () => next.cliOutput,
            /The instrumentation file was added/
          )
          await check(() => next.cliOutput, /bread/)
        })
      }
    }
  )
})
