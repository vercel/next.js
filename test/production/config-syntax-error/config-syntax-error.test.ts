import { nextTestSetup } from 'e2e-utils'

describe('Invalid config syntax', () => {
  // This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
  // @force-gate !deploy
  describe('production mode', () => {
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
      // Remove any existing config files first to avoid Next.js prioritizing .js over .mjs
      await next.deleteFile('next.config.js').catch(() => {})

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
  })
})
