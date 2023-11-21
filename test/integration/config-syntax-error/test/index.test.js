/* eslint-env jest */
import fsp from 'fs/promises'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfigJS = join(appDir, 'next.config.js')
const nextConfigMJS = join(appDir, 'next.config.mjs')

describe('Invalid config syntax', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('should error when next.config.js contains syntax error', async () => {
      await fsp.writeFile(
        nextConfigJS,
        `
      module.exports = {
        reactStrictMode: true,,
      }
    `
      )
      const { stderr } = await nextBuild(appDir, undefined, {
        stderr: true,
      })
      await fsp.rm(nextConfigJS, { recursive: true, force: true })

      expect(stderr).toContain(
        'Failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
      expect(stderr).toContain('SyntaxError')
    })

    it('should error when next.config.mjs contains syntax error', async () => {
      await fsp.writeFile(
        nextConfigMJS,
        `
      const config = {
        reactStrictMode: true,,
      }
      export default config
    `
      )
      const { stderr } = await nextBuild(appDir, undefined, {
        stderr: true,
      })
      await fsp.rm(nextConfigMJS, { recursive: true, force: true })

      expect(stderr).toContain(
        'Failed to load next.config.mjs, see more info here https://nextjs.org/docs/messages/next-config-error'
      )
      expect(stderr).toContain('SyntaxError')
    })
  })
})
