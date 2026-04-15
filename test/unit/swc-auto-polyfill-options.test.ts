import { getLoaderSWCOptions } from 'next/dist/build/swc/options'

describe('swcEnvOptions', () => {
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

  it('should not include extra env options when swcEnvOptions is not set', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: ['chrome 80'],
    })
    expect(options.env).toEqual({ targets: ['chrome 80'] })
  })

  it('should include mode and coreJs when configured', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: ['chrome 80'],
      swcEnvOptions: { mode: 'usage', coreJs: '3.38' },
    })
    expect(options.env).toEqual({
      targets: ['chrome 80'],
      mode: 'usage',
      coreJs: '3.38',
    })
  })

  it('should support entry mode', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: ['chrome 60', 'safari 11'],
      swcEnvOptions: { mode: 'entry', coreJs: '3.38' },
    })
    expect(options.env.mode).toBe('entry')
    expect(options.env.coreJs).toBe('3.38')
  })

  it('should pass through include, exclude, and other options', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: ['chrome 80'],
      swcEnvOptions: {
        mode: 'usage',
        coreJs: '3.38',
        include: ['es.array.at'],
        exclude: ['es.promise'],
        shippedProposals: true,
        loose: true,
      },
    })
    expect(options.env).toEqual({
      targets: ['chrome 80'],
      mode: 'usage',
      coreJs: '3.38',
      include: ['es.array.at'],
      exclude: ['es.promise'],
      shippedProposals: true,
      loose: true,
    })
  })

  it('should not set env when supportedBrowsers is empty', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      supportedBrowsers: undefined,
      swcEnvOptions: { mode: 'usage', coreJs: '3.38' },
    })
    expect(options.env).toBeUndefined()
    expect(options.jsc.target).toBe('es5')
  })

  it('should not affect server-side compilation', () => {
    const options = getLoaderSWCOptions({
      ...baseArgs,
      isServer: true,
      supportedBrowsers: ['chrome 80'],
      swcEnvOptions: { mode: 'usage', coreJs: '3.38' },
    })
    // Server targets node, not browsers
    expect(options.env.targets).toEqual({
      node: process.versions.node,
    })
    expect(options.env.mode).toBeUndefined()
  })
})
