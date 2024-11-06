import { nextTestSetup } from 'e2e-utils'
import { colorToRgb } from 'next-test-utils'

describe('Legacy sass-loader', () => {
  const { next: nextWithLegacyLoader } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.54.0' },
    nextConfig: undefined,
  })

  it('should render the module for the legacy sass-loader', async () => {
    const browser = await nextWithLegacyLoader.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })

  it('should show deprecation warning', async () => {
    expect(nextWithLegacyLoader.cliOutput).toContain(
      'Deprecation: The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0'
    )
  })
})

describe('Upgraded sass-loader', () => {
  const { next: nextWithUpgradedLoader } = nextTestSetup({
    files: __dirname,
    dependencies: { sass: '1.54.0' },
    nextConfig: {
      experimental: {
        useUpgradedLoader: true,
      },
    },
  })

  it('should render the module for the upgraded sass-loader', async () => {
    const browser = await nextWithUpgradedLoader.browser('/')
    expect(
      await browser.elementByCss('#verify-red').getComputedCss('color')
    ).toBe(colorToRgb('red'))
  })

  it('should not show deprecation warning', async () => {
    expect(nextWithUpgradedLoader.cliOutput).not.toContain(
      'Deprecation: The legacy JS API is deprecated and will be removed in Dart Sass 2.0.0'
    )
  })
})
