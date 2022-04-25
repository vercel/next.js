const nextDistPath =
  /(next[\\/]dist[\\/]shared[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

const regeneratorRuntimePath = require.resolve(
  'next/dist/compiled/regenerator-runtime'
)

export function getParserOptions({ filename, jsConfig, ...rest }) {
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
    [isTypeScript ? 'tsx' : 'jsx']: isTSFile ? false : true,
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
  return {
    jsc: {
      ...(resolvedBaseUrl && paths
        ? {
            baseUrl: resolvedBaseUrl,
            paths,
          }
        : {}),
      parser: parserConfig,
      experimental: {
        keepImportAssertions: true,
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
            (nextConfig?.experimental?.emotion ? '@emotion/react' : 'react'),
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
    styledComponents: nextConfig?.compiler?.styledComponents
      ? {
          displayName: Boolean(development),
        }
      : null,
    removeConsole: nextConfig?.compiler?.removeConsole,
    reactRemoveProperties: nextConfig?.compiler?.reactRemoveProperties,
    modularizeImports: nextConfig?.experimental?.modularizeImports,
    relay: nextConfig?.compiler?.relay,
    emotion: getEmotionOptions(nextConfig, development),
  }
}

function getEmotionOptions(nextConfig, development) {
  if (!nextConfig?.experimental?.emotion) {
    return null
  }
  let autoLabel = false
  switch (nextConfig?.experimental?.emotion?.autoLabel) {
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
    labelFormat: nextConfig?.experimental?.emotion?.labelFormat,
    sourcemap: development
      ? nextConfig?.experimental?.emotion?.sourceMap ?? true
      : false,
  }
}

export function getJestSWCOptions({
  isServer,
  filename,
  esm,
  nextConfig,
  jsConfig,
  // This is not passed yet as "paths" resolving needs a test first
  // resolvedBaseUrl,
}) {
  let baseOptions = getBaseSWCOptions({
    filename,
    jest: true,
    development: false,
    hasReactRefresh: false,
    globalWindow: !isServer,
    nextConfig,
    jsConfig,
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
  }
}

export function getLoaderSWCOptions({
  filename,
  development,
  isServer,
  pagesDir,
  isPageFile,
  hasReactRefresh,
  nextConfig,
  jsConfig,
  // This is not passed yet as "paths" resolving is handled by webpack currently.
  // resolvedBaseUrl,
}) {
  let baseOptions = getBaseSWCOptions({
    filename,
    development,
    globalWindow: !isServer,
    hasReactRefresh,
    nextConfig,
    jsConfig,
    // resolvedBaseUrl,
  })

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
      isPageFile,
    }
  }
}
