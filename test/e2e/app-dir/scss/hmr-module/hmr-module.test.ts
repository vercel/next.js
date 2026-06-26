/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb, retry } from 'next-test-utils'

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
])(
  'Can hot reload CSS Module without losing state ($dependencies)',
  ({ dependencies, nextConfig }) => {
    const { next, isNextDev } = nextTestSetup({
      files: __dirname,
      dependencies,
      nextConfig,
    })
    ;(isNextDev ? describe : describe.skip)('development only', () => {
      it('should update CSS color without remounting <input>', async () => {
        const browser = await next.browser('/')

        const desiredText = 'hello world'
        await browser.elementById('text-input').type(desiredText)
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )

        expect(
          await browser.elementByCss('#verify-red').getComputedCss('color')
        ).toBe(colorToRgb('red'))

        await next.patchFile('pages/index.module.scss', (content) => {
          return content.replace('$var: red', '$var: purple')
        })

        await retry(async () => {
          expect(
            await browser.elementByCss('#verify-red').getComputedCss('color')
          ).toBe(colorToRgb('purple'))
        })

        // ensure text remained
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )
      })
    })
  }
)
