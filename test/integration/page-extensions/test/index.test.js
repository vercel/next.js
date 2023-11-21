/* eslint-env jest */

import { join } from 'path'
import fsp from 'fs/promises'
import { runNextCommand } from 'next-test-utils'

const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

describe('Page Extensions', () => {
  it('should use the default pageExtensions if set to undefined', async () => {
    await fsp.writeFile(
      nextConfig,
      `module.exports = { pageExtensions: undefined }`
    )

    const { stdout } = await runNextCommand(['build', appDir], { stdout: true })

    await fsp.rm(nextConfig, { recursive: true, force: true })

    expect(stdout).toContain('Compiled successfully')
  })

  it('should throw if pageExtensions is an empty array', async () => {
    await fsp.writeFile(nextConfig, `module.exports = { pageExtensions: [] }`)

    const { stderr } = await runNextCommand(['build', appDir], { stderr: true })

    await fsp.rm(nextConfig, { recursive: true, force: true })

    expect(stderr).toContain(
      'Specified pageExtensions is an empty array. Please update it with the relevant extensions or remove it'
    )
  })

  it('should throw if pageExtensions has invalid extensions', async () => {
    await fsp.writeFile(
      nextConfig,
      `module.exports = { pageExtensions: ['js', 123] }`
    )

    const { stderr } = await runNextCommand(['build', appDir], { stderr: true })

    await fsp.rm(nextConfig, { recursive: true, force: true })

    expect(stderr).toContain(
      'Specified pageExtensions is not an array of strings, found "123" of type "number". Please update this config or remove it'
    )
  })

  it('should not throw if .d.ts file inside the pages folder', async () => {
    await fsp.writeFile(
      nextConfig,
      `module.exports = { pageExtensions: ['js', 'ts', 'tsx'] }`
    )

    const { stdout } = await runNextCommand(['build', appDir], { stdout: true })

    await fsp.rm(nextConfig, { recursive: true, force: true })

    expect(stdout).toContain('Compiled successfully')
  })
})
