/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'

describe.each([
  { dependencies: { sass: '1.54.0' }, nextConfig: undefined },
  {
    dependencies: { 'sass-embedded': '1.75.0' },
    nextConfig: {
      sassOptions: {
        implementation: 'sass-embedded',
      },
    },
  },
])('unused scss', ({ dependencies, nextConfig }) => {
  describe('Body is not hidden when unused in Development ($dependencies)', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    ;(isNextDev ? describe : describe.skip)('development only', () => {
      it('should have body visible', async () => {
        const browser = await next.browser('/')
        const currentDisplay = await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).display`
        )
        expect(currentDisplay).toBe('block')
      })
    })
  })

  describe('Body is not hidden when broken in Development', () => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })

    ;(isNextDev ? describe : describe.skip)('development only', () => {
      it('should have body visible', async () => {
        await next.patchFile('pages/index.js', (contents) => {
          return contents.replace('<div />', '<div>')
        })

        const browser = await next.browser('/')
        const currentDisplay = await browser.eval(
          `window.getComputedStyle(document.querySelector('body')).display`
        )
        expect(currentDisplay).toBe('block')
      })
    })
  })
})
