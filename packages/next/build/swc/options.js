const nextDistPath =
  /(next[\\/]dist[\\/]shared[\\/]lib)|(next[\\/]dist[\\/]client)|(next[\\/]dist[\\/]pages)/

function getBaseSWCOptions({
  filename,
  development,
  hasReactRefresh,
  globalWindow,
  styledComponents,
  paths,
  baseUrl,
}) {
  const isTSFile = filename.endsWith('.ts')
  const isTypeScript = isTSFile || filename.endsWith('.tsx')

  return {
    jsc: {
      ...(baseUrl && paths
        ? {
            baseUrl,
            paths,
          }
        : {}),
      parser: {
        syntax: isTypeScript ? 'typescript' : 'ecmascript',
        dynamicImport: true,
        // Exclude regular TypeScript files from React transformation to prevent e.g. generic parameters and angle-bracket type assertion from being interpreted as JSX tags.
        [isTypeScript ? 'tsx' : 'jsx']: isTSFile ? false : true,
      },

      transform: {
        react: {
          runtime: 'automatic',
          pragma: 'React.createElement',
          pragmaFrag: 'React.Fragment',
          throwIfNamespace: true,
          development: development,
          useBuiltins: true,
          refresh: hasReactRefresh,
        },
        optimizer: {
          simplify: false,
          globals: {
            typeofs: {
              window: globalWindow ? 'object' : 'undefined',
            },
          },
        },
        regenerator: {
          importPath: require.resolve('regenerator-runtime'),
        },
      },
    },
    styledComponents: styledComponents
      ? {
          displayName: Boolean(development),
        }
      : null,
  }
}

export function getJestSWCOptions({
  isServer,
  filename,
  esm,
  styledComponents,
  paths,
  baseUrl,
}) {
  let baseOptions = getBaseSWCOptions({
    filename,
    development: false,
    hasReactRefresh: false,
    globalWindow: !isServer,
    styledComponents,
    paths,
    baseUrl,
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
  styledComponents,
}) {
  let baseOptions = getBaseSWCOptions({
    filename,
    development,
    globalWindow: !isServer,
    hasReactRefresh,
    styledComponents,
  })

  const isNextDist = nextDistPath.test(filename)

  if (isServer) {
    return {
      ...baseOptions,
      // Disables getStaticProps/getServerSideProps tree shaking on the server compilation for pages
      disableNextSsg: true,
      disablePageConfig: true,
      isDevelopment: development,
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
      pagesDir,
      isPageFile,
    }
  }
}
