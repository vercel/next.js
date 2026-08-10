import { nextTestSetup } from 'e2e-utils'

describe('next.config evaluation error', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    async function buildAndGetOutput(): Promise<string> {
      const start = next.cliOutput.length
      await next.build()
      return next.cliOutput.slice(start)
    }

    it('should report a helpful error when the config function throws synchronously', async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = () => {
          return { foo: new Uint8Array(5_000_000_000) }
        }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('Invalid typed array length')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })

    it('should report a helpful error when the config module throws at the top level', async () => {
      await next.patchFile(
        'next.config.js',
        `
        const buf = new Uint8Array(5_000_000_000)
        module.exports = { foo: buf }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('Invalid typed array length')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })

    it('should report a helpful error when the config function rejects', async () => {
      await next.patchFile(
        'next.config.js',
        `
        module.exports = async () => {
          throw new Error('boom from async config plugin')
        }
      `
      )
      const output = await buildAndGetOutput()

      expect(output).toContain('boom from async config plugin')
      expect(output).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
    })
  })
})
