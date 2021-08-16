/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import { nextBuild } from 'next-test-utils'

jest.setTimeout(1000 * 60 * 1)
const appDir = join(__dirname, '..')
const nextConfig = join(appDir, 'next.config.js')

describe('Invalid resolve alias', () => {
  it('should show relevant error when webpack resolve alias is wrong', async () => {
    await fs.writeFile(
      nextConfig,
      `
      module.exports = {
        reactStrictMode: true,,
      }
    `
    )
    const { stderr } = await nextBuild(appDir, undefined, {
      stderr: true,
    })
    await fs.remove(nextConfig)

    expect(stderr).toContain(
      'Error: failed to load next.config.js, see more info here https://nextjs.org/docs/messages/next-config-error'
    )
    expect(stderr).toContain('SyntaxError')
  })
})
