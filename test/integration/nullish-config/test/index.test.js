/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { launchApp, findPort, nextBuild, killApp } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

let getStdout

const runTests = (type) => {
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

    if (type === 'dev') {
      expect(stdout).toMatch(/ready/i)
    } else {
      expect(stdout).toMatch(/Compiled successfully/i)
    }
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

    if (type === 'dev') {
      expect(stdout).toMatch(/ready/i)
    } else {
      expect(stdout).toMatch(/Compiled successfully/i)
    }
  })
}

describe('Nullish configs in next.config.js', () => {
  afterAll(() => fs.remove(nextConfig))

  describe('dev mode', () => {
    beforeAll(() => {
      getStdout = async () => {
        let stdout = ''
        const app = await launchApp(appDir, await findPort(), {
          onStdout: (msg) => {
            stdout += msg
          },
        })
        await killApp(app)
        return stdout
      }
    })

    runTests('dev')
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(() => {
      getStdout = async () => {
        const { stdout } = await nextBuild(appDir, [], { stdout: true })
        return stdout
      }
    })

    runTests('build')
  })
})
