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
  nextConfig,
  resolvedBaseUrl,
  jsConfig,
  swcCacheDir,
  isServerLayer,
  hasServerComponents,
}: any) {
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
  const plugins = (nextConfig?.experimental?.swcPlugins ?? [])
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
        keepImportAssertions: true,
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
            (nextConfig?.compiler?.emotion ? '@emotion/react' : 'react'),
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
    removeConsole: nextConfig?.compiler?.removeConsole,
    // disable "reactRemoveProperties" when "jest" is true
    // otherwise the setting from next.config.js will be used
    reactRemoveProperties: jest
      ? false
      : nextConfig?.compiler?.reactRemoveProperties,
    modularizeImports: nextConfig?.modularizeImports,
    relay: nextConfig?.compiler?.relay,
    // Always transform styled-jsx and error when `client-only` condition is triggered
    styledJsx: true,
    // Disable css-in-js libs (without client-only integration) transform on server layer for server components
    ...(!isServerLayer && {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      emotion: getEmotionOptions(nextConfig, development),
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      styledComponents: getStyledComponentsOptions(nextConfig, development),
    }),
    serverComponents: hasServerComponents
      ? { isServer: !!isServerLayer }
      : undefined,
    serverActions: hasServerComponents
      ? {
          isServer: !!isServerLayer,
        }
      : undefined,
  }
}

function getStyledComponentsOptions(nextConfig: any, development: any) {
  let styledComponentsOptions = nextConfig?.compiler?.styledComponents
  if (!styledComponentsOptions) {
    return null
  }

  return {
    ...styledComponentsOptions,
    displayName: styledComponentsOptions.displayName ?? Boolean(development),
  }
}

function getEmotionOptions(nextConfig: any, development: any) {
  if (!nextConfig?.compiler?.emotion) {
    return null
  }
  let autoLabel = false
  switch (nextConfig?.compiler?.emotion?.autoLabel) {
    case 'never':
      autoLabel = false
      break
    case 'always':
      autoLabel = true
      break
    case 'dev-only':
    default:
      autoLabel = !!development
      break
  }
  return {
    enabled: true,
    autoLabel,
    importMap: nextConfig?.compiler?.emotion?.importMap,
    labelFormat: nextConfig?.compiler?.emotion?.labelFormat,
    sourcemap: development
      ? nextConfig?.compiler?.emotion?.sourceMap ?? true
      : false,
  }
}

export function getJestSWCOptions({
  isServer,
  filename,
  esm,
  nextConfig,
  jsConfig,
  pagesDir,
  hasServerComponents,
}: // This is not passed yet as "paths" resolving needs a test first
// resolvedBaseUrl,
any) {
  let baseOptions = getBaseSWCOptions({
    filename,
    jest: true,
    development: false,
    hasReactRefresh: false,
    globalWindow: !isServer,
    nextConfig,
    jsConfig,
    hasServerComponents,
    // resolvedBaseUrl,
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
  nextConfig,
  jsConfig,
  supportedBrowsers,
  swcCacheDir,
  relativeFilePathFromRoot,
  hasServerComponents,
  isServerLayer,
}: // This is not passed yet as "paths" resolving is handled by webpack currently.
// resolvedBaseUrl,
any) {
  let baseOptions: any = getBaseSWCOptions({
    filename,
    development,
    globalWindow: !isServer,
    hasReactRefresh,
    nextConfig,
    jsConfig,
    // resolvedBaseUrl,
    swcCacheDir,
    relativeFilePathFromRoot,
    hasServerComponents,
    isServerLayer,
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
    // Matches default @babel/preset-env behavior
    baseOptions.jsc.target = 'es5'
    return {
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
  }
}
