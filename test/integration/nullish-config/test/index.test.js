/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { launchApp, findPort, nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

let getStdout

const runTests = () => {
  it('should ignore configs set to `undefined` in next.config.js', async () => {
    await fs.writeFile(
      nextConfig,
      `
        module.exports = {
          target: undefined,
          env: undefined,
          webpack: undefined,
          pageExtensions: undefined,
          amp: {
            canonicalBase: undefined,
          },
        }
      `
    )

    const stdout = await getStdout()

    expect(stdout).toContain('ompiled successfully')
  })

  it('should ignore configs set to `null` in next.config.js', async () => {
    await fs.writeFile(
      nextConfig,
      `
        module.exports = {
          target: null,
          env: null,
          webpack: null,
          pageExtensions: null,
          amp: {
            canonicalBase: null,
          },
        }
      `
    )

    const stdout = await getStdout()

    expect(stdout).toContain('ompiled successfully')
  })
}

describe('Nullish configs in next.config.js', () => {
  afterAll(() => fs.remove(nextConfig))

  describe('dev mode', () => {
    beforeAll(() => {
      getStdout = async () => {
        let stdout = ''
        await launchApp(appDir, await findPort(), {
          onStdout: (msg) => {
            stdout += msg
          },
        })
        return stdout
      }
    })

    runTests()
  })

  describe('production mode', () => {
    beforeAll(() => {
      getStdout = async () => {
        const { stdout } = await nextBuild(appDir, [], { stdout: true })
        return stdout
      }
    })

    runTests()
  })
})
