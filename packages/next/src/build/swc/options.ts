import path from 'path'
import { WEBPACK_LAYERS, type WebpackLayerName } from '../../lib/constants'
import type {
  NextConfig,
  ExperimentalConfig,
  EmotionConfig,
  StyledComponentsConfig,
} from '../../server/config-shared'
import type { ResolvedBaseUrl } from '../load-jsconfig'
import { isWebpackServerOnlyLayer, isWebpackAppPagesLayer } from '../utils'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'

const nextDirname = path.dirname(require.resolve('next/package.json'))

const nextDistPath = new RegExp(
  `${escapeStringRegexp(nextDirname)}[\\/]dist[\\/](shared[\\/]lib|client|pages)`
)

const nodeModulesPath = /[\\/]node_modules[\\/]/

const regeneratorRuntimePath = require.resolve(
  'next/dist/compiled/regenerator-runtime'
)

function isTypeScriptFile(filename: string) {
  return filename.endsWith('.ts') || filename.endsWith('.tsx')
}

function isCommonJSFile(filename: string) {
  return filename.endsWith('.cjs')
}

// Ensure Next.js internals and .cjs files are output as CJS modules,
// By default all modules are output as ESM or will treated as CJS if next-swc/auto-cjs plugin detects file is CJS.
function shouldOutputCommonJs(filename: string) {
  return isCommonJSFile(filename) || nextDistPath.test(filename)
}

export function getParserOptions({ filename, jsConfig, ...rest }: any) {
  const isTSFile = filename.endsWith('.ts')
  const hasTsSyntax = isTypeScriptFile(filename)
  const enableDecorators = Boolean(
    jsConfig?.compilerOptions?.experimentalDecorators
  )
  return {
    ...rest,
    syntax: hasTsSyntax ? 'typescript' : 'ecmascript',
    dynamicImport: true,
    decorators: enableDecorators,
    // Exclude regular TypeScript files from React transformation to prevent e.g. generic parameters and angle-bracket type assertion from being interpreted as JSX tags.
    [hasTsSyntax ? 'tsx' : 'jsx']: !isTSFile,
    importAssertions: true,
  }
}

function getBaseSWCOptions({
  filename,
  jest,
  development,
  hasReactRefresh,
  globalWindow,
  esm,
  modularizeImports,
  swcPlugins,
  compilerOptions,
  resolvedBaseUrl,
  jsConfig,
  swcCacheDir,
  serverComponents,
  serverReferenceHashSalt,
  bundleLayer,
  isDynamicIo,
  cacheHandlers,
  useCacheEnabled,
}: {
  filename: string
  jest?: boolean
  development: boolean
  hasReactRefresh: boolean
  globalWindow: boolean
  esm: boolean
  modularizeImports?: NextConfig['modularizeImports']
  compilerOptions: NextConfig['compiler']
  swcPlugins: ExperimentalConfig['swcPlugins']
  resolvedBaseUrl?: ResolvedBaseUrl
  jsConfig: any
  swcCacheDir?: string
  serverComponents?: boolean
  serverReferenceHashSalt: string
  bundleLayer?: WebpackLayerName
  isDynamicIo?: boolean
  cacheHandlers?: ExperimentalConfig['cacheHandlers']
  useCacheEnabled?: boolean
}) {
  const isReactServerLayer = isWebpackServerOnlyLayer(bundleLayer)
  const isAppRouterPagesLayer = isWebpackAppPagesLayer(bundleLayer)
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
            baseUrl: resolvedBaseUrl.baseUrl,
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
            (compilerOptions?.emotion && !isReactServerLayer
              ? '@emotion/react'
              : 'react'),
          runtime: 'automatic',
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
    ...(!isReactServerLayer && {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      emotion: getEmotionOptions(compilerOptions?.emotion, development),
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      styledComponents: getStyledComponentsOptions(
        compilerOptions?.styledComponents,
        development
      ),
    }),
    serverComponents:
      serverComponents && !jest
        ? {
            isReactServerLayer,
            dynamicIoEnabled: isDynamicIo,
            useCacheEnabled,
          }
        : undefined,
    serverActions:
      isAppRouterPagesLayer && !jest
        ? {
            isReactServerLayer,
            useCacheEnabled,
            hashSalt: serverReferenceHashSalt,
            cacheKinds: cacheHandlers ? Object.keys(cacheHandlers) : [],
          }
        : undefined,
    // For app router we prefer to bundle ESM,
    // On server side of pages router we prefer CJS.
    preferEsm: esm,
    lintCodemodComments: true,
    debugFunctionName: development,
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
  serverReferenceHashSalt,
}: {
  isServer: boolean
  filename: string
  esm: boolean
  modularizeImports?: NextConfig['modularizeImports']
  swcPlugins: ExperimentalConfig['swcPlugins']
  compilerOptions: NextConfig['compiler']
  jsConfig: any
  resolvedBaseUrl?: ResolvedBaseUrl
  pagesDir?: string
  serverComponents?: boolean
  serverReferenceHashSalt: string
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
    resolvedBaseUrl,
    esm,
    // Don't apply server layer transformations for Jest
    // Disable server / client graph assertions for Jest
    bundleLayer: undefined,
    serverComponents: false,
    serverReferenceHashSalt,
  })

  const useCjsModules = shouldOutputCommonJs(filename)
  return {
    ...baseOptions,
    env: {
      targets: {
        // Targets the current version of Node.js
        node: process.versions.node,
      },
    },
    module: {
      type: esm && !useCjsModules ? 'es6' : 'commonjs',
    },
    disableNextSsg: true,
    disablePageConfig: true,
    pagesDir,
  }
}

export function getLoaderSWCOptions({
  // This is not passed yet as "paths" resolving is handled by webpack currently.
  // resolvedBaseUrl,
  filename,
  development,
  isServer,
  pagesDir,
  appDir,
  isPageFile,
  isDynamicIo,
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
  serverComponents,
  serverReferenceHashSalt,
  bundleLayer,
  esm,
  cacheHandlers,
  useCacheEnabled,
}: {
  filename: string
  development: boolean
  isServer: boolean
  pagesDir?: string
  appDir?: string
  isPageFile: boolean
  hasReactRefresh: boolean
  optimizeServerReact?: boolean
  modularizeImports: NextConfig['modularizeImports']
  isDynamicIo?: boolean
  optimizePackageImports?: NonNullable<
    NextConfig['experimental']
  >['optimizePackageImports']
  swcPlugins: ExperimentalConfig['swcPlugins']
  compilerOptions: NextConfig['compiler']
  jsConfig: any
  supportedBrowsers: string[] | undefined
  swcCacheDir: string
  relativeFilePathFromRoot: string
  esm?: boolean
  serverComponents?: boolean
  serverReferenceHashSalt: string
  bundleLayer?: WebpackLayerName
  cacheHandlers: ExperimentalConfig['cacheHandlers']
  useCacheEnabled?: boolean
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
    bundleLayer,
    serverComponents,
    serverReferenceHashSalt,
    esm: !!esm,
    isDynamicIo,
    cacheHandlers,
    useCacheEnabled,
  })
  baseOptions.fontLoaders = {
    fontLoaders: ['next/font/local', 'next/font/google'],
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
      optimize_use_state: false,
    }
  }

  // Modularize import optimization for barrel files
  if (optimizePackageImports) {
    baseOptions.autoModularizeImports = {
      packages: optimizePackageImports,
    }
  }

  const isNodeModules = nodeModulesPath.test(filename)
  const isAppBrowserLayer = bundleLayer === WEBPACK_LAYERS.appPagesBrowser
  const moduleResolutionConfig = shouldOutputCommonJs(filename)
    ? {
        module: {
          type: 'commonjs',
        },
      }
    : {}

  let options: any
  if (isServer) {
    options = {
      ...baseOptions,
      ...moduleResolutionConfig,
      // Disables getStaticProps/getServerSideProps tree shaking on the server compilation for pages
      disableNextSsg: true,
      disablePageConfig: true,
      isDevelopment: development,
      isServerCompiler: isServer,
      pagesDir,
      appDir,
      preferEsm: !!esm,
      isPageFile,
      env: {
        targets: {
          // Targets the current version of Node.js
          node: process.versions.node,
        },
      },
    }
  } else {
    options = {
      ...baseOptions,
      ...moduleResolutionConfig,
      disableNextSsg: !isPageFile,
      isDevelopment: development,
      isServerCompiler: isServer,
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
  }

  // For node_modules in app browser layer, we don't need to do any server side transformation.
  // Only keep server actions transform to discover server actions from client components.
  if (isAppBrowserLayer && isNodeModules) {
    options.disableNextSsg = true
    options.disablePageConfig = true
    options.isPageFile = false
    options.optimizeServerReact = undefined
    options.cjsRequireOptimizer = undefined
    // Disable optimizer for node_modules in app browser layer, to avoid unnecessary replacement.
    // e.g. typeof window could result differently in js worker or browser.
    if (options.jsc.transform.optimizer.globals?.typeofs) {
      delete options.jsc.transform.optimizer.globals.typeofs.window
    }
  }

  return options
}
