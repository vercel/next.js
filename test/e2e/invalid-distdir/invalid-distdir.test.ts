/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate !deploy
describe('invalid distDir', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  const expectStartError = async (expected: string | RegExp) => {
    if (isNextDev) {
      try {
        await next.start()
        await next.fetch('/').catch(() => {})
      } catch {}
      await retry(() => expect(next.cliOutput).toMatch(expected))
    } else {
      await expect(next.start()).rejects.toThrow()
      expect(next.cliOutput).toMatch(expected)
    }
  }

  beforeEach(async () => {
    await next.stop()
    await next.remove('.next')
  })

  it('refuses a distDir outside the application and workspace', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: '../..', outputFileTracingRoot: '/' }`,
      async () => {
        await expectStartError('should be inside of the application directory')
      }
    )
  })

  it('refuses a distDir that is the application directory itself', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: '.' }`,
      async () => {
        await expectStartError('must not contain the application directory')
        expect(await next.hasFile('pages/index.tsx')).toBe(true)
      }
    )
  })
})
