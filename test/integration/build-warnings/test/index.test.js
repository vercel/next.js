/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { nextBuild, File, waitFor } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = join(__dirname, '../')

describe('Build warnings', () => {
  it('should not shown warning about minification withou any modification', async () => {
    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })
    expect(stderr).not.toContain('optimization has been disabled')
  })

  it('should shown warning about minification for minimize', async () => {
    const nextConfig = new File(join(appDir, 'next.config.js'))

    await waitFor(500)

    nextConfig.replace('true', 'false')

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

    expect(stderr).toContain('optimization has been disabled')

    nextConfig.restore()
  })

  it('should shown warning about minification for minimizer', async () => {
    const nextConfig = new File(join(appDir, 'next.config.js'))

    await waitFor(500)

    nextConfig.replace(
      'config.optimization.minimize = true',
      'config.optimization.minimizer = []'
    )

    const { stderr } = await nextBuild(appDir, undefined, { stderr: true })

    expect(stderr).toContain('optimization has been disabled')

    nextConfig.restore()
  })
})
