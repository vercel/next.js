import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

// This tests file symlinks, but not directory symlinks. Directory symlinks are
// known to break route manifest generation:
// https://github.com/vercel/next.js/discussions/77463
describe('HMR symlinks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('tracks updates to symlinked target', async () => {
    const browser = await next.browser('/symlink-link')

    expect(await browser.elementByCss('h1').text()).toBe(
      'This is the symlink target'
    )

    await next.patchFile(
      'app/symlink-target/page.tsx',
      (content) => content.replace('symlink target', 'updated symlink target'),
      async () => {
        await retry(async () => {
          await assertNoRedbox(browser)
          expect(await browser.elementByCss('h1').text()).toBe(
            'This is the updated symlink target'
          )
        })
      }
    )
  })

  /* eslint-disable jest/no-standalone-expect */
  // This works in Turbopack and Rspack, but is broken in webpack!
  ;(process.env.IS_TURBOPACK_TEST || process.env.NEXT_RSPACK ? it : it.skip)(
    'tracks updates to the symlink',
    async () => {
      const browser = await next.browser('/symlink-link')

      expect(await browser.elementByCss('h1').text()).toBe(
        'This is the symlink target'
      )

      try {
        await next.symlink(
          'app/symlink-target2/page.tsx',
          'app/symlink-link/page.tsx'
        )
        await retry(async () => {
          await assertNoRedbox(browser)
          expect(await browser.elementByCss('h1').text()).toBe(
            'This is the second symlink target'
          )
        })
      } finally {
        await next.symlink(
          'app/symlink-target/page.tsx',
          'app/symlink-link/page.tsx'
        )
      }
    }
  )

  // This works in Turbopack, but is broken in webpack!
  ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
    'tracks updates to the middle of a symlink chain',
    async () => {
      const browser = await next.browser('/symlink-chain')

      expect(await browser.elementByCss('h1').text()).toBe(
        'This is the symlink target'
      )

      try {
        await next.symlink(
          'app/symlink-target2/page.tsx',
          'app/symlink-link/page.tsx'
        )
        await retry(async () => {
          await assertNoRedbox(browser)
          expect(await browser.elementByCss('h1').text()).toBe(
            'This is the second symlink target'
          )
        })
      } finally {
        await next.symlink(
          'app/symlink-target/page.tsx',
          'app/symlink-link/page.tsx'
        )
      }
    }
  )
  /* eslint-enable jest/no-standalone-expect */
})
