import { nextTestSetup } from 'e2e-utils'

describe('Invalid config syntax', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
      })

      it('should error when next.config.js contains syntax error', async () => {
        await next.patchFile(
          'next.config.js',
          `
      module.exports = {
        reactStrictMode: true,,
      }
    `
        )
        await next.build()

        expect(next.cliOutput).toContain(
          'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
        )
        expect(next.cliOutput).toContain('SyntaxError')
      })

      it('should error when next.config.mjs contains syntax error', async () => {
        await next.patchFile(
          'next.config.mjs',
          `
      const config = {
        reactStrictMode: true,,
      }
      export default config
    `
        )
        await next.build()

        expect(next.cliOutput).toContain(
          'Failed to load next.config.mjs, see more info here https://nextjs.org/docs/messages/next-config-error'
        )
        expect(next.cliOutput).toContain('SyntaxError')
      })
    }
  )
})
