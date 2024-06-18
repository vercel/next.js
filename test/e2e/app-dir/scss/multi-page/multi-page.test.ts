/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import { colorToRgb, retry } from 'next-test-utils'

describe('SCSS Support', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.54.0',
    },
  })
  describe('Has CSS in computed styles in Production', () => {
    it('should have CSS for page', async () => {
      const browser = await next.browser('/page2')

      expect(
        await browser.elementByCss('.blue-text').getComputedCss('color')
      ).toBe(colorToRgb('blue'))
    })
  })

  if (isNextDev) {
    describe('Can hot reload CSS without losing state', () => {
      it('should update CSS color without remounting <input>', async () => {
        const browser = await next.browser('/page1')

        const desiredText = 'hello world'
        await browser.elementById('text-input').type(desiredText)
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )

        expect(
          await browser.elementByCss('.red-text').getComputedCss('color')
        ).toBe(colorToRgb('red'))

        await next.patchFile('styles/global1.scss', (contents) => {
          return contents.replace('$var: red', '$var: purple')
        })

        await retry(async () => {
          expect(
            await browser.elementByCss('.red-text').getComputedCss('color')
          ).toBe(colorToRgb('purple'))
        })

        // ensure text remained
        expect(await browser.elementById('text-input').getValue()).toBe(
          desiredText
        )
      })
    })
  }

  describe('Has CSS in computed styles in Development', () => {
    it('should have CSS for page', async () => {
      const browser = await next.browser('/page2')

      expect(
        await browser.elementByCss('.blue-text').getComputedCss('color')
      ).toBe(colorToRgb('blue'))
    })
  })
})
