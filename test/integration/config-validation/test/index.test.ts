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
        'The value at .images.loader must be one of',
        'The value at .rewrites must be a function that returns a Promise',
        'The value at .swcMinify must be a boolean but it was a string',
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
        'The root value has an unexpected property, nonExistent,',
        'The value at .experimental has an unexpected property, anotherNonExistent',
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
