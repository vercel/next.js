import path from 'path'
import * as React from 'react'
import {
  DOT_NEXT_ALIAS,
  PAGES_DIR_ALIAS,
  ROOT_DIR_ALIAS,
  APP_DIR_ALIAS,
  RSC_ACTION_PROXY_ALIAS,
  RSC_ACTION_CLIENT_WRAPPER_ALIAS,
  RSC_ACTION_VALIDATE_ALIAS,
  RSC_ACTION_ENCRYPTION_ALIAS,
  RSC_CACHE_WRAPPER_ALIAS,
  type WebpackLayerName,
} from '../lib/constants'
import type { NextConfigComplete } from '../server/config-shared'
import { defaultOverrides } from '../server/require-hook'
import { hasExternalOtelApiPackage } from './webpack-config'
import { NEXT_PROJECT_ROOT } from './next-dir-paths'
import { WEBPACK_LAYERS } from '../lib/constants'
import { isWebpackServerOnlyLayer } from './utils'

interface CompilerAliases {
  [alias: string]: string | string[]
}

const isReact19 = typeof React.use === 'function'

export function createWebpackAliases({
  distDir,
  isClient,
  isEdgeServer,
  isNodeServer,
  dev,
  config,
  pagesDir,
  appDir,
  dir,
  reactProductionProfiling,
  hasRewrites,
}: {
  distDir: string
  isClient: boolean
  isEdgeServer: boolean
  isNodeServer: boolean
  dev: boolean
  config: NextConfigComplete
  pagesDir: string | undefined
  appDir: string | undefined
  dir: string
  reactProductionProfiling: boolean
  hasRewrites: boolean
}): CompilerAliases {
  const pageExtensions = config.pageExtensions
  const clientResolveRewrites = require.resolve(
    '../shared/lib/router/utils/resolve-rewrites'
  )
  const customAppAliases: CompilerAliases = {}
  const customDocumentAliases: CompilerAliases = {}

  // tell webpack where to look for _app and _document
  // using aliases to allow falling back to the default
  // version when removed or not present
  if (dev) {
    const nextDistPath = 'next/dist/' + (isEdgeServer ? 'esm/' : '')
    customAppAliases[`${PAGES_DIR_ALIAS}/_app`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_app.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_app.js`,
    ]
    customAppAliases[`${PAGES_DIR_ALIAS}/_error`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_error.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_error.js`,
    ]
    customDocumentAliases[`${PAGES_DIR_ALIAS}/_document`] = [
      ...(pagesDir
        ? pageExtensions.reduce((prev, ext) => {
            prev.push(path.join(pagesDir, `_document.${ext}`))
            return prev
          }, [] as string[])
        : []),
      `${nextDistPath}pages/_document.js`,
    ]
  }

  return {
    '@vercel/og$': 'next/dist/server/og/image-response',

    // Avoid bundling both entrypoints in React 19 when we just need one.
    // Also avoids bundler warnings in React 18 where react-dom/server.edge doesn't exist.
    'next/dist/server/ReactDOMServerPages': isReact19
      ? 'react-dom/server.edge'
      : 'react-dom/server.browser',

    // Alias next/dist imports to next/dist/esm assets,
    // let this alias hit before `next` alias.
    ...(isEdgeServer
      ? {
          'next/dist/api': 'next/dist/esm/api',
          'next/dist/build': 'next/dist/esm/build',
          'next/dist/client': 'next/dist/esm/client',
          'next/dist/shared': 'next/dist/esm/shared',
          'next/dist/pages': 'next/dist/esm/pages',
          'next/dist/lib': 'next/dist/esm/lib',
          'next/dist/server': 'next/dist/esm/server',

          ...createNextApiEsmAliases(),
        }
      : undefined),

    // For RSC server bundle
    ...(!hasExternalOtelApiPackage() && {
      '@opentelemetry/api': 'next/dist/compiled/@opentelemetry/api',
    }),

    ...(config.images.loaderFile
      ? {
          'next/dist/shared/lib/image-loader': config.images.loaderFile,
          ...(isEdgeServer && {
            'next/dist/esm/shared/lib/image-loader': config.images.loaderFile,
          }),
        }
      : undefined),

    'styled-jsx/style$': defaultOverrides['styled-jsx/style'],
    'styled-jsx$': defaultOverrides['styled-jsx'],

    ...customAppAliases,
    ...customDocumentAliases,

    ...(pagesDir ? { [PAGES_DIR_ALIAS]: pagesDir } : {}),
    ...(appDir ? { [APP_DIR_ALIAS]: appDir } : {}),
    [ROOT_DIR_ALIAS]: dir,
    [DOT_NEXT_ALIAS]: distDir,
    ...(isClient || isEdgeServer ? getOptimizedModuleAliases() : {}),
    ...(reactProductionProfiling ? getReactProfilingInProduction() : {}),

    // For Node server, we need to re-alias the package imports to prefer to
    // resolve to the ESM export.
    ...(isNodeServer
      ? getBarrelOptimizationAliases(
          config.experimental.optimizePackageImports || []
        )
      : {}),

    [RSC_ACTION_VALIDATE_ALIAS]:
      'next/dist/build/webpack/loaders/next-flight-loader/action-validate',

    [RSC_ACTION_CLIENT_WRAPPER_ALIAS]:
      'next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper',

    [RSC_ACTION_PROXY_ALIAS]:
      'next/dist/build/webpack/loaders/next-flight-loader/server-reference',

    [RSC_ACTION_ENCRYPTION_ALIAS]: 'next/dist/server/app-render/encryption',

    [RSC_CACHE_WRAPPER_ALIAS]:
      'next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper',

    ...(isClient || isEdgeServer
      ? {
          [clientResolveRewrites]: hasRewrites
            ? clientResolveRewrites
            : // With webpack 5 an alias can be pointed to false to noop
              false,
        }
      : {}),

    '@swc/helpers/_': path.join(
      path.dirname(require.resolve('@swc/helpers/package.json')),
      '_'
    ),

    setimmediate: 'next/dist/compiled/setimmediate',
  }
}

export function createServerOnlyClientOnlyAliases(
  isServer: boolean
): CompilerAliases {
  return isServer
    ? {
        'server-only$': 'next/dist/compiled/server-only/empty',
        'client-only$': 'next/dist/compiled/client-only/error',
        'next/dist/compiled/server-only$':
          'next/dist/compiled/server-only/empty',
        'next/dist/compiled/client-only$':
          'next/dist/compiled/client-only/error',
      }
    : {
        'server-only$': 'next/dist/compiled/server-only/index',
        'client-only$': 'next/dist/compiled/client-only/index',
        'next/dist/compiled/client-only$':
          'next/dist/compiled/client-only/index',
        'next/dist/compiled/server-only':
          'next/dist/compiled/server-only/index',
      }
}

export function createNextApiEsmAliases() {
  const mapping = {
    head: 'next/dist/api/head',
    image: 'next/dist/api/image',
    constants: 'next/dist/api/constants',
    router: 'next/dist/api/router',
    dynamic: 'next/dist/api/dynamic',
    script: 'next/dist/api/script',
    link: 'next/dist/api/link',
    form: 'next/dist/api/form',
    navigation: 'next/dist/api/navigation',
    headers: 'next/dist/api/headers',
    og: 'next/dist/api/og',
    server: 'next/dist/api/server',
    // pages api
    document: 'next/dist/api/document',
    app: 'next/dist/api/app',
  }
  const aliasMap: Record<string, string> = {}
  // Handle fully specified imports like `next/image.js`
  for (const [key, value] of Object.entries(mapping)) {
    const nextApiFilePath = path.join(NEXT_PROJECT_ROOT, key)
    aliasMap[nextApiFilePath + '.js'] = value
  }

  return aliasMap
}

export function createAppRouterApiAliases(isServerOnlyLayer: boolean) {
  const mapping: Record<string, string> = {
    head: 'next/dist/client/components/noop-head',
    dynamic: 'next/dist/api/app-dynamic',
    link: 'next/dist/client/app-dir/link',
  }

  if (isServerOnlyLayer) {
    mapping['navigation'] = 'next/dist/api/navigation.react-server'
  }

  const aliasMap: Record<string, string> = {}
  for (const [key, value] of Object.entries(mapping)) {
    const nextApiFilePath = path.join(NEXT_PROJECT_ROOT, key)
    aliasMap[nextApiFilePath + '.js'] = value
  }
  return aliasMap
}

export function createRSCAliases(
  bundledReactChannel: string,
  {
    layer,
    isEdgeServer,
    reactProductionProfiling,
  }: {
    layer: WebpackLayerName
    isEdgeServer: boolean
    reactProductionProfiling: boolean
  }
): CompilerAliases {
  const isServerOnlyLayer = isWebpackServerOnlyLayer(layer)
  // For middleware, instrumentation layers, treat them as rsc layer.
  // Since we only built the runtime package for rsc, convert everything to rsc
  // to ensure the runtime modules path existed.
  if (isServerOnlyLayer) {
    layer = WEBPACK_LAYERS.reactServerComponents
  }

  let alias: Record<string, string> = {
    react$: `next/dist/compiled/react${bundledReactChannel}`,
    'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}`,
    'react/jsx-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-runtime`,
    'react/jsx-dev-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-dev-runtime`,
    'react/compiler-runtime$': `next/dist/compiled/react${bundledReactChannel}/compiler-runtime`,
    'react-dom/client$': `next/dist/compiled/react-dom${bundledReactChannel}/client`,
    'react-dom/server$': `next/dist/compiled/react-dom${bundledReactChannel}/server`,
    'react-dom/server.browser$': `next/dist/compiled/react-dom${bundledReactChannel}/server.browser`,
    'react-dom/static$': `next/dist/compiled/react-dom${bundledReactChannel}/static`,
    'react-dom/static.edge$': `next/dist/compiled/react-dom${bundledReactChannel}/static.edge`,
    'react-dom/static.browser$': `next/dist/compiled/react-dom${bundledReactChannel}/static.browser`,
    // optimizations to ignore the legacy build of react-dom/server in `server.edge` build
    'react-dom/server.edge$': `next/dist/build/webpack/alias/react-dom-server-edge${bundledReactChannel}.js`,
    // react-server-dom-webpack alias
    'react-server-dom-webpack/client$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client`,
    'react-server-dom-webpack/client.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/client.edge`,
    'react-server-dom-webpack/server.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.edge`,
    'react-server-dom-webpack/server.node$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/server.node`,
    'react-server-dom-webpack/static.edge$': `next/dist/compiled/react-server-dom-webpack${bundledReactChannel}/static.edge`,
  }

  if (!isEdgeServer) {
    if (layer === WEBPACK_LAYERS.serverSideRendering) {
      alias = Object.assign(alias, {
        'react/jsx-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-jsx-runtime`,
        'react/jsx-dev-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-jsx-dev-runtime`,
        'react/compiler-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-compiler-runtime`,
        react$: `next/dist/server/route-modules/app-page/vendored/${layer}/react`,
        'react-dom$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-dom`,
        'react-server-dom-webpack/client.edge$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-server-dom-webpack-client-edge`,
      })
    } else if (layer === WEBPACK_LAYERS.reactServerComponents) {
      alias = Object.assign(alias, {
        'react/jsx-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-jsx-runtime`,
        'react/jsx-dev-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-jsx-dev-runtime`,
        'react/compiler-runtime$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-compiler-runtime`,
        react$: `next/dist/server/route-modules/app-page/vendored/${layer}/react`,
        'react-dom$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-dom`,
        'react-server-dom-webpack/server.edge$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-server-dom-webpack-server-edge`,
        'react-server-dom-webpack/server.node$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-server-dom-webpack-server-node`,
        'react-server-dom-webpack/static.edge$': `next/dist/server/route-modules/app-page/vendored/${layer}/react-server-dom-webpack-static-edge`,
      })
    }
  }

  if (isEdgeServer) {
    if (layer === WEBPACK_LAYERS.reactServerComponents) {
      alias = Object.assign(alias, {
        react$: `next/dist/compiled/react${bundledReactChannel}/react.react-server`,
        'next/dist/compiled/react$': `next/dist/compiled/react${bundledReactChannel}/react.react-server`,
        'next/dist/compiled/react-experimental$': `next/dist/compiled/react-experimental/react.react-server`,
        'react/jsx-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-runtime.react-server`,
        'react/compiler-runtime$': `next/dist/compiled/react${bundledReactChannel}/compiler-runtime`,
        'next/dist/compiled/react/jsx-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-runtime.react-server`,
        'next/dist/compiled/react-experimental/jsx-runtime$': `next/dist/compiled/react-experimental/jsx-runtime.react-server`,
        'react/jsx-dev-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-dev-runtime.react-server`,
        'next/dist/compiled/react/jsx-dev-runtime$': `next/dist/compiled/react${bundledReactChannel}/jsx-dev-runtime.react-server`,
        'next/dist/compiled/react-experimental/jsx-dev-runtime$': `next/dist/compiled/react-experimental/jsx-dev-runtime.react-server`,
        'react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}/react-dom.react-server`,
        'next/dist/compiled/react-dom$': `next/dist/compiled/react-dom${bundledReactChannel}/react-dom.react-server`,
        'next/dist/compiled/react-dom-experimental$': `next/dist/compiled/react-dom-experimental/react-dom.react-server`,
      })
    }
  }

  if (reactProductionProfiling) {
    alias['react-dom/client$'] =
      `next/dist/compiled/react-dom${bundledReactChannel}/profiling`
  }

  alias[
    '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts'
  ] = `next/dist/client/dev/noop-turbopack-hmr`

  return alias
}

// Insert aliases for Next.js stubs of fetch, object-assign, and url
// Keep in sync with insert_optimized_module_aliases in import_map.rs
export function getOptimizedModuleAliases(): CompilerAliases {
  return {
    unfetch: require.resolve('next/dist/build/polyfills/fetch/index.js'),
    'isomorphic-unfetch': require.resolve(
      'next/dist/build/polyfills/fetch/index.js'
    ),
    'whatwg-fetch': require.resolve(
      'next/dist/build/polyfills/fetch/whatwg-fetch.js'
    ),
    'object-assign': require.resolve(
      'next/dist/build/polyfills/object-assign.js'
    ),
    'object.assign/auto': require.resolve(
      'next/dist/build/polyfills/object.assign/auto.js'
    ),
    'object.assign/implementation': require.resolve(
      'next/dist/build/polyfills/object.assign/implementation.js'
    ),
    'object.assign/polyfill': require.resolve(
      'next/dist/build/polyfills/object.assign/polyfill.js'
    ),
    'object.assign/shim': require.resolve(
      'next/dist/build/polyfills/object.assign/shim.js'
    ),
    url: require.resolve('next/dist/compiled/native-url'),
  }
}

// Alias these modules to be resolved with "module" if possible.
function getBarrelOptimizationAliases(packages: string[]): CompilerAliases {
  const aliases: { [pkg: string]: string } = {}
  const mainFields = ['module', 'main']

  for (const pkg of packages) {
    try {
      const descriptionFileData = require(`${pkg}/package.json`)
      const descriptionFilePath = require.resolve(`${pkg}/package.json`)

      for (const field of mainFields) {
        if (descriptionFileData.hasOwnProperty(field)) {
          aliases[pkg + '$'] = path.join(
            path.dirname(descriptionFilePath),
            descriptionFileData[field]
          )
          break
        }
      }
    } catch {}
  }

  return aliases
}
function getReactProfilingInProduction(): CompilerAliases {
  return {
    'react-dom/client$': 'react-dom/profiling',
  }
}
