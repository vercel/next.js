/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = path.join(__dirname, '..')
const nextConfig = path.join(appDir, 'next.config.js')

describe('Shows error with getStaticProps in _error', () => {
  it('shows the error in server mode', async () => {
    await fs.remove(nextConfig)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain(
      'unstable_getStaticProps cannot currently be used for `_error`. Please remove it for now.'
    )
  })

  it('shows the error in serverless mode', async () => {
    await fs.writeFile(nextConfig, `module.exports = { target: 'serverless' }`)
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(nextConfig)
    expect(stderr).toContain(
      'unstable_getStaticProps cannot currently be used for `_error`. Please remove it for now.'
    )
  })
})
