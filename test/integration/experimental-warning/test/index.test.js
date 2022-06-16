/* eslint-env jest */

import { join } from 'path'
import { nextBuild, File } from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

describe('experimental-warning', () => {
  afterEach(() => {
    nextConfig.restore()
  })

  it('should not print experimental warning if no experimental key', async () => {
    const { code, stdout, stderr } = await nextBuild(appDir)
    expect(code).toBe(0)
    expect(stdout + stderr).not.toMatch('You have enabled experimental')
  })

  it('should print experimental warning with single key', async () => {
    nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        experimental: {
          foo: true,
        },
      })
    )
    const { code, stdout, stderr } = await nextBuild(appDir)
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(
      'You have enabled experimental feature (foo) in next.config.js.'
    )
  })

  it('should print experimental warning with multiple keys', async () => {
    nextConfig.replace(
      '{ /* replaceme */ }',
      JSON.stringify({
        experimental: {
          foo: true,
          bar: 1,
          baz: new Date(),
        },
      })
    )
    const { code, stdout, stderr } = await nextBuild(appDir)
    expect(code).toBe(0)
    expect(stdout + stderr).toMatch(
      'You have enabled experimental features (foo, bar, baz) in next.config.js.'
    )
  })
})
