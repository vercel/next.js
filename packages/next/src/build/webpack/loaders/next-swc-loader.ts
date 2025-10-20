/*
Copyright (c) 2017 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

import type { NextConfig } from '../../../types'
import { type WebpackLayerName, WEBPACK_LAYERS } from '../../../lib/constants'
import { isWasm, transform } from '../../swc'
import { getLoaderSWCOptions } from '../../swc/options'
import path, { isAbsolute } from 'path'
import { babelIncludeRegexes } from '../../webpack-config'
import { isResourceInPackages } from '../../handle-externals'
import type { TelemetryLoaderContext } from '../plugins/telemetry-plugin/telemetry-plugin'
import {
  updateTelemetryLoaderCtxFromTransformOutput,
  type SwcTransformTelemetryOutput,
} from '../plugins/telemetry-plugin/update-telemetry-loader-context-from-swc'
import type { LoaderContext } from 'webpack'
import {
  COMPILER_NAMES,
  type CompilerNameValues,
} from '../../../shared/lib/constants'

const maybeExclude = (
  excludePath: string,
  transpilePackages: string[]
): boolean => {
  if (babelIncludeRegexes.some((r) => r.test(excludePath))) {
    return false
  }

  const shouldBeBundled = isResourceInPackages(excludePath, transpilePackages)
  if (shouldBeBundled) return false

  return excludePath.includes('node_modules')
}

export interface SWCLoaderOptions {
  rootDir: string
  isServer: boolean
  compilerType: CompilerNameValues
  pagesDir?: string
  appDir?: string
  hasReactRefresh: boolean
  optimizeServerReact?: boolean
  nextConfig: NextConfig
  jsConfig: any
  supportedBrowsers: string[] | undefined
  swcCacheDir: string
  serverComponents?: boolean
  serverReferenceHashSalt: string
  bundleLayer?: WebpackLayerName
  esm?: boolean
  transpilePackages?: string[]
}

// these are exact code conditions checked
// for to force transpiling a `node_module`
const FORCE_TRANSPILE_CONDITIONS =
  /next\/font|next\/dynamic|use server|use client|use cache/
// same as above, but including `import(...)`.
// (note the optional whitespace: `import  (...)` is also syntactically valid)
const FORCE_TRANSPILE_CONDITIONS_WITH_IMPORT = new RegExp(
  String.raw`(?:${FORCE_TRANSPILE_CONDITIONS.source})|import\s*\(`
)

async function loaderTransform(
  this: LoaderContext<SWCLoaderOptions> & TelemetryLoaderContext,
  source?: string,
  inputSourceMap?: any
) {
  // Make the loader async
  const filename = this.resourcePath

  // Ensure `.d.ts` are not processed.
  if (filename.endsWith('.d.ts')) {
    return [source, inputSourceMap]
  }

  let loaderOptions: SWCLoaderOptions = this.getOptions() || {}
  const shouldMaybeExclude = maybeExclude(
    filename,
    loaderOptions.transpilePackages || []
  )

  const trackDynamicImports = shouldTrackDynamicImports(loaderOptions)

  if (shouldMaybeExclude) {
    if (!source) {
      throw new Error(`Invariant might be excluded but missing source`)
    }

    const forceTranspileConditions = trackDynamicImports
      ? FORCE_TRANSPILE_CONDITIONS_WITH_IMPORT
      : FORCE_TRANSPILE_CONDITIONS

    if (!forceTranspileConditions.test(source)) {
      return [source, inputSourceMap]
    }
  }

  const {
    isServer,
    rootDir,
    pagesDir,
    appDir,
    hasReactRefresh,
    nextConfig,
    jsConfig,
    supportedBrowsers,
    swcCacheDir,
    serverComponents,
    serverReferenceHashSalt,
    bundleLayer,
    esm,
  } = loaderOptions
  const isPageFile = pagesDir ? filename.startsWith(pagesDir) : false
  const relativeFilePathFromRoot = path.relative(rootDir, filename)

  const swcOptions = getLoaderSWCOptions({
    pagesDir,
    appDir,
    filename,
    isServer,
    isPageFile,
    development:
      this.mode === 'development' ||
      !!nextConfig.experimental?.allowDevelopmentBuild,
    isCacheComponents: nextConfig.cacheComponents,
    hasReactRefresh,
    modularizeImports: nextConfig?.modularizeImports,
    optimizePackageImports: nextConfig?.experimental?.optimizePackageImports,
    swcPlugins: nextConfig?.experimental?.swcPlugins,
    compilerOptions: nextConfig?.compiler,
    optimizeServerReact: nextConfig?.experimental?.optimizeServerReact,
    jsConfig,
    supportedBrowsers,
    swcCacheDir,
    relativeFilePathFromRoot,
    serverComponents,
    serverReferenceHashSalt,
    bundleLayer,
    esm,
    cacheHandlers: nextConfig.experimental?.cacheHandlers,
    useCacheEnabled: nextConfig.experimental?.useCache,
    trackDynamicImports,
  })

  const programmaticOptions = {
    ...swcOptions,
    filename,
    inputSourceMap: inputSourceMap ? JSON.stringify(inputSourceMap) : undefined,

    // Set the default sourcemap behavior based on Webpack's mapping flag,
    sourceMaps: this.sourceMap,
    inlineSourcesContent: this.sourceMap,

    // Ensure that Webpack will get a full absolute path in the sourcemap
    // so that it can properly map the module back to its internal cached
    // modules.
    sourceFileName: filename,
  }

  if (!programmaticOptions.inputSourceMap) {
    delete programmaticOptions.inputSourceMap
  }

  // auto detect development mode
  if (
    this.mode &&
    programmaticOptions.jsc &&
    programmaticOptions.jsc.transform &&
    programmaticOptions.jsc.transform.react &&
    !Object.prototype.hasOwnProperty.call(
      programmaticOptions.jsc.transform.react,
      'development'
    )
  ) {
    programmaticOptions.jsc.transform.react.development =
      this.mode === 'development'
  }

  return transform(source as any, programmaticOptions).then(
    (
      output: {
        code: string
        map?: string
      } & SwcTransformTelemetryOutput
    ) => {
      updateTelemetryLoaderCtxFromTransformOutput(this, output)
      return [output.code, output.map ? JSON.parse(output.map) : undefined]
    }
  )
}

function shouldTrackDynamicImports(loaderOptions: SWCLoaderOptions): boolean {
  // we only need to track `import()` 1. in cacheComponents, 2. on the server (RSC and SSR)
  // (Note: logic duplicated in crates/next-core/src/next_server/transforms.rs)
  const { nextConfig, bundleLayer, compilerType } = loaderOptions
  return (
    !!nextConfig.cacheComponents &&
    // NOTE: `server` means nodejs. `cacheComponents` is not supported in the edge runtime, so we want to exclude it.
    // (also, the code generated by the dynamic imports transform relies on `CacheSignal`, which uses nodejs-specific APIs)
    compilerType === COMPILER_NAMES.server &&
    (bundleLayer === WEBPACK_LAYERS.reactServerComponents ||
      bundleLayer === WEBPACK_LAYERS.serverSideRendering)
  )
}

const EXCLUDED_PATHS =
  /[\\/](cache[\\/][^\\/]+\.zip[\\/]node_modules|__virtual__)[\\/]/g

export function pitch(this: any) {
  const callback = this.async()
  let loaderOptions: SWCLoaderOptions = this.getOptions() || {}

  const shouldMaybeExclude = maybeExclude(
    this.resourcePath,
    loaderOptions.transpilePackages || []
  )

  ;(async () => {
    if (
      // if it might be excluded/no-op we can't use pitch loader
      !shouldMaybeExclude &&
      // TODO: investigate swc file reading in PnP mode?
      !process.versions.pnp &&
      !EXCLUDED_PATHS.test(this.resourcePath) &&
      this.loaders.length - 1 === this.loaderIndex &&
      isAbsolute(this.resourcePath) &&
      !(await isWasm())
    ) {
      this.addDependency(this.resourcePath)
      return loaderTransform.call(this)
    }
  })().then((r) => {
    if (r) return callback(null, ...r)
    callback()
  }, callback)
}

export default function swcLoader(
  this: any,
  inputSource: string,
  inputSourceMap: any
) {
  const callback = this.async()
  loaderTransform.call(this, inputSource, inputSourceMap).then(
    ([transformedSource, outputSourceMap]: any) => {
      callback(null, transformedSource, outputSourceMap || inputSourceMap)
    },
    (err: Error) => {
      callback(err)
    }
  )
}

// accept Buffers instead of strings
export const raw = true
