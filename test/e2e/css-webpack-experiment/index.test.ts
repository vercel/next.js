import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import webdriver from 'next-webdriver'

describe('CSS webpack Experiment', () => {
  describe('with basic CSS', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: new FileRef(__dirname),
        nextConfig: {
          experimental: {
            webpackCssExperiment: true,
          },
        },
        dependencies: {
          react: 'latest',
          'react-dom': 'latest',
          sass: 'latest',
        },
      })
    })

    afterAll(() => next.destroy())

    it('should work with basic CSS', async () => {
      const browser = await webdriver(next.url, `/`)
      const element = await browser.elementByCss('p')
      const color = await element.getComputedCss('color')

      expect(color).toBe('rgb(0, 128, 0)')
    })

    it('should work with CSS modules', async () => {
      const browser = await webdriver(next.url, `/css-modules`)
      const element = await browser.elementByCss('p')
      const color = await element.getComputedCss('color')

      expect(color).toBe('rgb(255, 0, 0)')
    })

    it('should work with SASS', async () => {
      const browser = await webdriver(next.url, `/sass`)
      const element = await browser.elementByCss('p')
      const color = await element.getComputedCss('color')

      expect(color).toBe('rgb(0, 0, 255)')
    })
  })
})
