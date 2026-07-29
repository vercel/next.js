import { getLoaderSWCOptions } from 'next/dist/build/swc/options'

const baseArgs = {
  filename: '/app/page.tsx',
  development: false,
  isServer: false,
  pagesDir: '/pages',
  appDir: '/app',
  isPageFile: false,
  hasReactRefresh: false,
  modularizeImports: undefined,
  swcPlugins: undefined,
  compilerOptions: undefined,
  jsConfig: {},
  swcCacheDir: '/tmp/swc',
  relativeFilePathFromRoot: 'app/page.tsx',
  serverComponents: false,
  serverReferenceHashSalt: 'test-salt',
  bundleLayer: undefined,
  cacheHandlers: undefined,
  configDir: '/',
}

describe('decorator parser options', () => {
  it.each(['legacy', '2021-12', '2022-03'] as const)(
    'should enable parsing when decoratorVersion is %s',
    (decoratorVersion) => {
      const options = getLoaderSWCOptions({
        ...baseArgs,
        compilerOptions: { decoratorVersion },
        supportedBrowsers: undefined,
      })

      expect(options.jsc.parser.decorators).toBe(true)
      expect(options.jsc.transform.legacyDecorator).toBe(
        decoratorVersion === 'legacy'
      )
      expect(options.jsc.transform.decoratorVersion).toBe(
        decoratorVersion === 'legacy' ? undefined : decoratorVersion
      )
    }
  )

  it('should preserve experimentalDecorators compatibility', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      jsConfig: {
        compilerOptions: {
          experimentalDecorators: true,
        },
      },
      supportedBrowsers: undefined,
    })

    expect(options.jsc.parser.decorators).toBe(true)
    expect(options.jsc.transform.legacyDecorator).toBe(true)
    expect(options.jsc.transform.decoratorVersion).toBeUndefined()
  })

  it.each(['2021-12', '2022-03'] as const)(
    'should prefer decoratorVersion %s over experimentalDecorators',
    (decoratorVersion) => {
      const options = getLoaderSWCOptions({
        ...baseArgs,
        compilerOptions: { decoratorVersion },
        jsConfig: {
          compilerOptions: {
            experimentalDecorators: true,
          },
        },
        supportedBrowsers: undefined,
      })

      expect(options.jsc.parser.decorators).toBe(true)
      expect(options.jsc.transform.legacyDecorator).toBe(false)
      expect(options.jsc.transform.decoratorVersion).toBe(decoratorVersion)
    }
  )

  it('should not enable parsing when decorators are not configured', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: undefined,
    })

    expect(options.jsc.parser.decorators).toBe(false)
    expect(options.jsc.transform.legacyDecorator).toBe(false)
    expect(options.jsc.transform.decoratorVersion).toBeUndefined()
  })
})
