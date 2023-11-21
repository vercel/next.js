/* eslint-env jest */

import path from 'path'
import fsp from 'fs/promises'
import { nextBuild } from 'next-test-utils'

const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

describe('Errors on output to public', () => {
  afterEach(async () => {
    await fsp.rm(nextConfig, { recursive: true, force: true })
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    it('Throws error when `distDir` is set to public', async () => {
      await fsp.writeFile(nextConfig, `module.exports = { distDir: 'public' }`)
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      expect(results.stdout + results.stderr).toMatch(
        /The 'public' directory is reserved in Next\.js and can not be set as/
      )
    })

    it('Throws error when export out dir is public', async () => {
      await fsp.writeFile(
        nextConfig,
        `module.exports = { distDir: 'public', output: 'export' }`
      )
      const results = await nextBuild(appDir, [], {
        stdout: true,
        stderr: true,
      })
      expect(results.stdout + results.stderr).toMatch(
        /The 'public' directory is reserved in Next\.js and can not be/
      )
    })
  })
})
