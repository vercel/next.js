import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Legacy sass-loader', () => {
  const { next: nextWithLegacyLoader } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.80.7' },
  })

  it('should render the module for the legacy sass-loader', async () => {
    const browser = await nextWithLegacyLoader.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })
})

describe('Upgraded sass-loader', () => {
  const { next: nextWithUpgradedLoader } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.80.7' },
    nextConfig: {
      sassOptions: {
        experimental: {
          useUpgradedLoader: true,
        },
      },
    },
  })

  it('should render the module for the upgraded sass-loader', async () => {
    const browser = await nextWithUpgradedLoader.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })
})
