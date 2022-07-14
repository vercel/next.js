import path from 'path'
import { nextBuild } from 'next-test-utils'
import fs from 'fs-extra'

const nextConfigPath = path.join(__dirname, '../next.config.js')

describe('next.config.js validation', () => {
  it.each([
    {
      name: 'invalid config types',
      configContent: `
        module.exports = {
          swcMinify: 'hello',
          rewrites: true,
          images: {
            loader: 'something'
          }
        }
      `,
      outputs: [
        '/images/loader',
        'must be equal to one of the allowed values',
        'imgix',
        '/rewrites',
        'must pass \\"isFunction\\" keyword validation',
        '/swcMinify',
        'must be boolean',
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
        'nonExistent',
        'must NOT have additional properties',
        'anotherNonExistent',
        'must NOT have additional properties',
      ],
    },
  ])(
    'it should validate correctly for $name',
    async ({ outputs, configContent }) => {
      await fs.writeFile(nextConfigPath, configContent)
      const result = await nextBuild(path.join(__dirname, '../'), undefined, {
        stderr: true,
        stdout: true,
      })
      await fs.remove(nextConfigPath)

      for (const output of outputs) {
        expect(result.stdout + result.stderr).toContain(output)
      }
    }
  )
})
