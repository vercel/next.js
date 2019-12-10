/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

describe('Legacy Prerender', () => {
  describe('handles old getStaticParams', () => {
    it('should fail the build in server mode', async () => {
      const out = await nextBuild(appDir, [], { stderr: true })
      expect(out.stderr).toMatch(`Build error occurred`)
      expect(out.stderr).toMatch(
        'unstable_getStaticParams was replaced with unstable_getStaticPaths. Please update your code.'
      )
    })

    it('should fail the build in serverless mode', async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      const out = await nextBuild(appDir, [], { stderr: true })
      await fs.remove(nextConfig)
      expect(out.stderr).toMatch(`Build error occurred`)
      expect(out.stderr).toMatch(
        'unstable_getStaticParams was replaced with unstable_getStaticPaths. Please update your code.'
      )
    })
  })
})
