/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('invalid distDir', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) return

  const expectStartError = async (expected: string | RegExp) => {
    if (isNextDev) {
      await next.start()
      await next.fetch('/').catch(() => {})
      await retry(() => expect(next.cliOutput).toMatch(expected))
    } else {
      await expect(next.start()).rejects.toThrow()
      expect(next.cliOutput).toMatch(expected)
    }
  }

  beforeEach(async () => {
    await next.stop()
    await next.remove('.next')
    await next.remove('not-a-build-dir')
  })

  afterAll(async () => {
    await next.remove('not-a-build-dir')
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
        await expectStartError(
          /should be inside of the application directory|does not appear to have been created by Next\.js/
        )
        expect(await next.hasFile('pages/index.tsx')).toBe(true)
      }
    )
  })

  it('refuses a distDir holding unrelated files', async () => {
    await next.patchFile('not-a-build-dir/important.txt', 'user data')
    await next.patchFile('not-a-build-dir/nested/source.js', 'more user data')

    await next.patchFile(
      'next.config.js',
      `module.exports = { distDir: 'not-a-build-dir' }`,
      async () => {
        await expectStartError(
          'does not appear to have been created by Next.js'
        )
        expect(await next.readFile('not-a-build-dir/important.txt')).toBe(
          'user data'
        )
        expect(await next.readFile('not-a-build-dir/nested/source.js')).toBe(
          'more user data'
        )
      }
    )
  })
})
