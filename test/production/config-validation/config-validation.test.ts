import { nextTestSetup } from 'e2e-utils'

describe('next.config.js validation', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it.each([
      {
        name: 'invalid config types',
        configContent: `
        module.exports = {
          rewrites: true,
          images: {
            loader: 'something'
          }
        }
      `,
        outputs: [
          `received 'something' at "images.loader"`,
          'Expected function, received boolean at "rewrites"',
        ],
      },
      {
        name: 'unexpected config fields',
        configContent: `
        module.exports = {
          nonExistent: true,
          experimental: {
            anotherNonExistent: true
          }
        }
      `,
        outputs: [
          `Unrecognized key(s) in object: 'nonExistent'`,
          `Unrecognized key(s) in object: 'anotherNonExistent' at "experimental"`,
        ],
      },
      {
        name: 'invalid config array lengths',
        configContent: `
        module.exports = {
          pageExtensions: []
        }
      `,
        outputs: [
          'Array must contain at least 1 element(s) at "pageExtensions"',
        ],
      },
    ])(
      'it should validate correctly for $name',
      async ({ outputs, configContent }) => {
        await next.patchFile('next.config.js', configContent)
        await next.build()

        for (const output of outputs) {
          expect(next.cliOutput).toContain(output)
        }
      }
    )

    it('should allow undefined environment variables', async () => {
      const configContent = `
        module.exports = {
          env: {
            FOO: 'bar',
            QUX: undefined
          }
        }
      `

      await next.patchFile('next.config.js', configContent)
      await next.build()

      expect(next.cliOutput).not.toContain('"env.QUX" is missing')
    })
  })
})
