import type {
  NextConfig,
  ExperimentalConfig,
  EmotionConfig,
  StyledComponentsConfig,
} from '../../server/config-shared'

export type BundleType = 'client' | 'server' | 'default'

const nextDistPath =
  /(next[\\/]dist[\\/]shared[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

const regeneratorRuntimePath = require.resolve(
  'next/dist/compiled/regenerator-runtime'
)

export function getParserOptions({ filename, jsConfig, ...rest }: any) {
  const isTSFile = filename.endsWith('.ts')
  const isTypeScript = isTSFile || filename.endsWith('.tsx')
  const enableDecorators = Boolean(
    jsConfig?.compilerOptions?.experimentalDecorators
  )
  return {
    ...rest,
    syntax: isTypeScript ? 'typescript' : 'ecmascript',
    dynamicImport: true,
    decorators: enableDecorators,
    // Exclude regular TypeScript files from React transformation to prevent e.g. generic parameters and angle-bracket type assertion from being interpreted as JSX tags.
    [isTypeScript ? 'tsx' : 'jsx']: !isTSFile,
    importAssertions: true,
  }
}

function getBaseSWCOptions({
  filename,
  jest,
  development,
  hasReactRefresh,
  globalWindow,
  modularizeImports,
  swcPlugins,
  compilerOptions,
  resolvedBaseUrl,
  jsConfig,
  swcCacheDir,
  isServerLayer,
  bundleTarget,
  hasServerComponents,
  isServerActionsEnabled,
}: {
  filename: string
  jest?: boolean
  development: boolean
  hasReactRefresh: boolean
  globalWindow: boolean
  modularizeImports?: NextConfig['modularizeImports']
  compilerOptions: NextConfig['compiler']
  swcPlugins: ExperimentalConfig['swcPlugins']
  isServerActionsEnabled?: ExperimentalConfig['serverActions']
  resolvedBaseUrl?: string
  jsConfig: any
  bundleTarget: BundleType
  swcCacheDir?: string
  isServerLayer?: boolean
  hasServerComponents?: boolean
}) {
  const parserConfig = getParserOptions({ filename, jsConfig })
  const paths = jsConfig?.compilerOptions?.paths
  const enableDecorators = Boolean(
    jsConfig?.compilerOptions?.experimentalDecorators
  )
  const emitDecoratorMetadata = Boolean(
    jsConfig?.compilerOptions?.emitDecoratorMetadata
  )
  const useDefineForClassFields = Boolean(
    jsConfig?.compilerOptions?.useDefineForClassFields
  )
  const plugins = (swcPlugins ?? [])
    .filter(Array.isArray)
    .map(([name, options]: any) => [require.resolve(name), options])

  return {
    jsc: {
      ...(resolvedBaseUrl && paths
        ? {
            baseUrl: resolvedBaseUrl,
            paths,
          }
        : {}),
      externalHelpers: !process.versions.pnp && !jest,
      parser: parserConfig,
      experimental: {
        keepImportAttributes: true,
        emitAssertForImportAttributes: true,
        plugins,
        cacheRoot: swcCacheDir,
      },
      transform: {
        // Enables https://github.com/swc-project/swc/blob/0359deb4841be743d73db4536d4a22ac797d7f65/crates/swc_ecma_ext_transforms/src/jest.rs
        ...(jest
          ? {
              hidden: {
                jest: true,
              },
            }
          : {}),
        legacyDecorator: enableDecorators,
        decoratorMetadata: emitDecoratorMetadata,
        useDefineForClassFields: useDefineForClassFields,
        react: {
          importSource:
            jsConfig?.compilerOptions?.jsxImportSource ??
            (compilerOptions?.emotion && !isServerLayer
              ? '@emotion/react'
              : 'react'),
          runtime: 'automatic',
          pragma: 'React.createElement',
          pragmaFrag: 'React.Fragment',
          throwIfNamespace: true,
          development: !!development,
          useBuiltins: true,
          refresh: !!hasReactRefresh,
        },
        optimizer: {
          simplify: false,
          globals: jest
            ? null
            : {
                typeofs: {
                  window: globalWindow ? 'object' : 'undefined',
                },
                envs: {
                  NODE_ENV: development ? '"development"' : '"production"',
                },
                // TODO: handle process.browser to match babel replacing as well
              },
        },
        regenerator: {
          importPath: regeneratorRuntimePath,
        },
      },
    },
    sourceMaps: jest ? 'inline' : undefined,
    removeConsole: compilerOptions?.removeConsole,
    // disable "reactRemoveProperties" when "jest" is true
    // otherwise the setting from next.config.js will be used
    reactRemoveProperties: jest
      ? false
      : compilerOptions?.reactRemoveProperties,
    // Map the k-v map to an array of pairs.
    modularizeImports: modularizeImports
      ? Object.fromEntries(
          Object.entries(modularizeImports).map(([mod, config]) => [
            mod,
            {
              ...config,
              transform:
                typeof config.transform === 'string'
                  ? config.transform
                  : Object.entries(config.transform).map(([key, value]) => [
                      key,
                      value,
                    ]),
            },
          ])
        )
      : undefined,
    relay: compilerOptions?.relay,
    // Always transform styled-jsx and error when `client-only` condition is triggered
    styledJsx: {},
    // Disable css-in-js libs (without client-only integration) transform on server layer for server components
    ...(!isServerLayer && {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      emotion: getEmotionOptions(compilerOptions?.emotion, development),
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      styledComponents: getStyledComponentsOptions(
        compilerOptions?.styledComponents,
        development
      ),
    }),
    serverComponents:
      hasServerComponents && !jest ? { isServer: !!isServerLayer } : undefined,
    serverActions:
      hasServerComponents && !jest
        ? {
            // TODO-APP: When Server Actions is stable, we need to remove this flag.
            enabled: !!isServerActionsEnabled,
            isServer: !!isServerLayer,
          }
        : undefined,
    bundleTarget,
  }
}

function getStyledComponentsOptions(
  styledComponentsConfig: undefined | boolean | StyledComponentsConfig,
  development: any
) {
  if (!styledComponentsConfig) {
    return null
  } else if (typeof styledComponentsConfig === 'object') {
    return {
      ...styledComponentsConfig,
      displayName: styledComponentsConfig.displayName ?? Boolean(development),
    }
  } else {
    return {
      displayName: Boolean(development),
    }
  }
}

function getEmotionOptions(
  emotionConfig: undefined | boolean | EmotionConfig,
  development: boolean
) {
  if (!emotionConfig) {
    return null
  }
  let autoLabel = !!development
  switch (typeof emotionConfig === 'object' && emotionConfig.autoLabel) {
    case 'never':
      autoLabel = false
      break
    case 'always':
      autoLabel = true
      break
    case 'dev-only':
    default:
      break
  }
  return {
    enabled: true,
    autoLabel,
    sourcemap: development,
    ...(typeof emotionConfig === 'object' && {
      importMap: emotionConfig.importMap,
      labelFormat: emotionConfig.labelFormat,
      sourcemap: development && emotionConfig.sourceMap,
    }),
  }
}

export function getJestSWCOptions({
  isServer,
  filename,
  esm,
  modularizeImports,
  swcPlugins,
  compilerOptions,
  jsConfig,
  resolvedBaseUrl,
  pagesDir,
  hasServerComponents,
}: {
  isServer: boolean
  filename: string
  esm: boolean
  modularizeImports?: NextConfig['modularizeImports']
  swcPlugins: ExperimentalConfig['swcPlugins']
  compilerOptions: NextConfig['compiler']
  jsConfig: any
  resolvedBaseUrl?: string
  pagesDir?: string
  hasServerComponents?: boolean
}) {
  let baseOptions = getBaseSWCOptions({
    filename,
    jest: true,
    development: false,
    hasReactRefresh: false,
    globalWindow: !isServer,
    modularizeImports,
    swcPlugins,
    compilerOptions,
    jsConfig,
    hasServerComponents,
    resolvedBaseUrl,
    // Don't apply server layer transformations for Jest
    isServerLayer: false,
    // Disable server / client graph assertions for Jest
    bundleTarget: 'default',
  })

  const isNextDist = nextDistPath.test(filename)

  return {
    ...baseOptions,
    env: {
      targets: {
        // Targets the current version of Node.js
        node: process.versions.node,
      },
    },
    module: {
      type: esm && !isNextDist ? 'es6' : 'commonjs',
    },
    disableNextSsg: true,
    disablePageConfig: true,
    pagesDir,
  }
}

export function getLoaderSWCOptions({
  filename,
  development,
  isServer,
  pagesDir,
  appDir,
  isPageFile,
  hasReactRefresh,
  modularizeImports,
  optimizeServerReact,
  optimizePackageImports,
  swcPlugins,
  compilerOptions,
  jsConfig,
  supportedBrowsers,
  swcCacheDir,
  relativeFilePathFromRoot,
  hasServerComponents,
  isServerLayer,
  isServerActionsEnabled,
  optimizeBarrelExports,
  bundleTarget,
}: // This is not passed yet as "paths" resolving is handled by webpack currently.
// resolvedBaseUrl,
{
  filename: string
  development: boolean
  isServer: boolean
  pagesDir?: string
  appDir?: string
  isPageFile: boolean
  hasReactRefresh: boolean
  optimizeServerReact?: boolean
  modularizeImports: NextConfig['modularizeImports']
  optimizePackageImports?: NonNullable<
    NextConfig['experimental']
  >['optimizePackageImports']
  swcPlugins: ExperimentalConfig['swcPlugins']
  compilerOptions: NextConfig['compiler']
  jsConfig: any
  supportedBrowsers: string[] | undefined
  swcCacheDir: string
  relativeFilePathFromRoot: string
  bundleTarget: BundleType
  hasServerComponents?: boolean
  isServerLayer: boolean
  isServerActionsEnabled?: boolean
  optimizeBarrelExports?: {
    wildcard: boolean
  }
}) {
  let baseOptions: any = getBaseSWCOptions({
    filename,
    development,
    globalWindow: !isServer,
    hasReactRefresh,
    modularizeImports,
    swcPlugins,
    compilerOptions,
    jsConfig,
    // resolvedBaseUrl,
    swcCacheDir,
    hasServerComponents,
    isServerLayer,
    isServerActionsEnabled,
    bundleTarget,
  })
  baseOptions.fontLoaders = {
    fontLoaders: [
      'next/font/local',
      'next/font/google',

      // TODO: remove this in the next major version
      '@next/font/local',
      '@next/font/google',
    ],
    relativeFilePathFromRoot,
  }
  baseOptions.cjsRequireOptimizer = {
    packages: {
      'next/server': {
        transforms: {
          NextRequest: 'next/dist/server/web/spec-extension/request',
          NextResponse: 'next/dist/server/web/spec-extension/response',
          ImageResponse: 'next/dist/server/web/spec-extension/image-response',
          userAgentFromString: 'next/dist/server/web/spec-extension/user-agent',
          userAgent: 'next/dist/server/web/spec-extension/user-agent',
        },
      },
    },
  }

  if (optimizeServerReact && isServer && !development) {
    baseOptions.optimizeServerReact = {
      optimize_use_state: true,
    }
  }

  // Modularize import optimization for barrel files
  if (optimizePackageImports) {
    baseOptions.autoModularizeImports = {
      packages: optimizePackageImports,
    }
  }
  if (optimizeBarrelExports) {
    baseOptions.optimizeBarrelExports = optimizeBarrelExports
  }

  const isNextDist = nextDistPath.test(filename)

  if (isServer) {
    return {
      ...baseOptions,
      // Disables getStaticProps/getServerSideProps tree shaking on the server compilation for pages
      disableNextSsg: true,
      disablePageConfig: true,
      isDevelopment: development,
      isServer,
      pagesDir,
      appDir,
      isPageFile,
      env: {
        targets: {
          // Targets the current version of Node.js
          node: process.versions.node,
        },
      },
    }
  } else {
    const options = {
      ...baseOptions,
      // Ensure Next.js internals are output as commonjs modules
      ...(isNextDist
        ? {
            module: {
              type: 'commonjs',
            },
          }
        : {}),
      disableNextSsg: !isPageFile,
      isDevelopment: development,
      isServer,
      pagesDir,
      appDir,
      isPageFile,
      ...(supportedBrowsers && supportedBrowsers.length > 0
        ? {
            env: {
              targets: supportedBrowsers,
            },
          }
        : {}),
    }
    if (!options.env) {
      // Matches default @babel/preset-env behavior
      options.jsc.target = 'es5'
    }
    return options
  }
}
