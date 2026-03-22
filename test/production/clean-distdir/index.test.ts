/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe('Cleaning distDir', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) return

  beforeEach(async () => {
    await next.stop()
    await next.remove('.next')
  })

  async function checkFileWrite(existsAfterBuild: boolean) {
    await next.build()

    const customFile = '.next/extra-file.txt'
    await next.patchFile(customFile, 'this is a testing file')

    await next.build()

    expect(await next.hasFile(customFile)).toBe(existsAfterBuild)

    // `.next/cache` should be preserved in all cases
    expect(await next.hasFile('.next/cache')).toBe(true)
    if (!isTurbopack) {
      expect(await next.hasFile('.next/cache/swc')).toBe(true)
    }
  }

  describe('disabled write', () => {
    it('should clean up .next before build start', async () => {
      await checkFileWrite(false)
    })

    it('should not clean up .next before build start', async () => {
      await next.patchFile(
        'next.config.js',
        `
          module.exports = {
            cleanDistDir: false
          }
        `,
        async () => {
          await checkFileWrite(true)
        }
      )
    })
  })
})
