/* eslint-env jest */

import path from 'path'
import fs from 'fs-extra'
import { nextBuild, nextExport } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

describe('Errors on output to public', () => {
  it('Throws error when `distDir` is set to public', async () => {
    await fs.writeFile(nextConfig, `module.exports = { distDir: 'public' }`)
    const results = await nextBuild(appDir, [], { stdout: true, stderr: true })
    expect(results.stdout + results.stderr).toMatch(
      /The 'public' directory is reserved in Next\.js and can not be set as/
    )
    await fs.remove(nextConfig)
  })

  it('Throws error when export out dir is public', async () => {
    await fs.remove(nextConfig)
    await nextBuild(appDir)
    const outdir = path.join(appDir, 'public')
    const results = await nextExport(
      appDir,
      { outdir },
      {
        stdout: true,
        stderr: true,
      }
    )
    expect(results.stdout + results.stderr).toMatch(
      /The 'public' directory is reserved in Next\.js and can not be used as/
    )
  })
})
