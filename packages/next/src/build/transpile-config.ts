import { readFile, unlink, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import { pathToFileURL } from 'url'
import { transform } from './swc'
import { runCompiler } from './compiler'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { trace } from '../trace'
import type { Options } from '@swc/core'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { SWCLoaderOptions } from './webpack/loaders/next-swc-loader'
import type { NextConfig } from '../server/config-shared'

const swcOptions: Options = {
  jsc: {
    target: 'es5',
    parser: {
      syntax: 'typescript',
    },
  },
  module: {
    type: 'commonjs',
  },
  isModule: 'unknown',
}

export async function transpileConfig({
  nextConfigPath,
  nextConfigName,
  cwd,
}: {
  nextConfigPath: string
  nextConfigName: string
  cwd: string
}) {
  let tsConfig: any = {}
  let packageJson: any = {}
  try {
    // TODO: Use dynamic import when repo TS upgraded >= 5.3
    tsConfig = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  // package.json type: module or next.config.mts
  const isESM =
    extname(nextConfigName) === '.mts' || packageJson.type === 'module'
  // On CJS projects, importing Native ESM will need the config to be .mjs
  // Therefore the config needs to be next.config.mts
  // On ESM projects, it won't matter if the config is .mjs or .js if in ESM format
  const nextCompiledConfigName = `next.compiled.config${isESM ? '.mjs' : '.js'}`

  // Return early if nextConfig does not have a valid import or require
  let tempNextConfigPath = ''
  try {
    // Transpile by SWC to check if has import or require other than type
    const tempNextConfig = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(tempNextConfig, swcOptions)
    const hasImportOrRequire = code.includes('require(')

    // Does not have an import or require, no need to use webpack
    if (!hasImportOrRequire) {
      // Write to next.config.cjs
      tempNextConfigPath = join(cwd, `next.config.cjs`)
      await writeFile(tempNextConfigPath, code)
    }
  } catch {
  } finally {
    if (tempNextConfigPath) {
      await unlink(tempNextConfigPath).catch(() => {})
    }
  }

  const nextBuildSpan = trace('next-config-ts')
  const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
  const resolvedBaseUrl = {
    baseUrl: join(cwd, tsConfig.compilerOptions?.baseUrl ?? ''),
    isImplicit: Boolean(tsConfig.compilerOptions?.baseUrl),
  }

  async function _bundle(nextConfig: NextConfig = {}): Promise<NextConfig> {
    const distDir = nextConfig.distDir ?? '.next'
    const webpackConfig: webpack.Configuration = {
      mode: 'none',
      entry: nextConfigPath,
      experiments: {
        // Needed for output.libraryTarget: 'module'
        outputModule: isESM,
      },
      output: {
        filename: nextCompiledConfigName,
        path: join(cwd, distDir),
        libraryTarget: isESM ? 'module' : 'commonjs2',
      },
      resolve: {
        plugins: [
          new JsConfigPathsPlugin(
            tsConfig.compilerOptions?.paths ?? {},
            resolvedBaseUrl
          ),
        ],
        modules: ['node_modules'],
        extensions: ['.ts', '.mts', '.cts'],
        // Need to resolve @swc/helpers/_/ alias for next config as async function:
        // Module not found: Can't resolve '@swc/helpers/_/_async_to_generator'
        alias: {
          '@swc/helpers/_': join(
            dirname(require.resolve('@swc/helpers/package.json')),
            '_'
          ),
        },
      },
      plugins: [new ProfilingPlugin({ runWebpackSpan, rootDir: cwd })],
      module: {
        rules: [
          {
            test: /\.(c|m)?ts$/,
            exclude: /node_modules/,
            loader: require.resolve('./webpack/loaders/next-swc-loader'),
            options: {
              rootDir: cwd,
              isServer: false,
              hasReactRefresh: false,
              nextConfig,
              jsConfig: {
                compilerOptions: tsConfig.options,
              },
              swcCacheDir: join(cwd, distDir, 'cache', 'swc'),
              supportedBrowsers: undefined,
              esm: isESM,
            } satisfies SWCLoaderOptions,
          },
        ],
      },
    }

    // Support tsconfig baseUrl
    // Only add the baseUrl if it's explicitly set in tsconfig
    if (!resolvedBaseUrl.isImplicit) {
      webpackConfig.resolve!.modules!.push(resolvedBaseUrl.baseUrl)
    }

    const [{ errors }] = await runCompiler(webpackConfig, {
      runWebpackSpan,
    })

    if (errors.length > 0) {
      throw new Error(errors[0].message)
    }

    const nextCompiledConfigPath = join(cwd, distDir, nextCompiledConfigName)
    const nextCompiledConfig = await import(
      pathToFileURL(nextCompiledConfigPath).href
    )

    // For named-exported configs, we do not supoort it but proceeds as something like:
    //  ⚠ Invalid next.config.ts options detected:
    //  ⚠     Unrecognized key(s) in object: 'config'
    // So we try to return the default if exits, otherwise return-
    // the whole object as is to prevent returning undefined and preserve the current behavior
    return nextCompiledConfig.default ?? nextCompiledConfig
  }

  try {
    const nextConfig = await _bundle()

    // TODO: Do we really need to re-compile?
    if (
      // List of options possibly passed to next-swc-loader
      nextConfig.modularizeImports ||
      nextConfig.experimental?.optimizePackageImports ||
      nextConfig.experimental?.swcPlugins ||
      nextConfig.compiler ||
      nextConfig.experimental?.optimizeServerReact ||
      // For swcCacheDir option
      nextConfig.distDir
    ) {
      // Re-compile with the parsed nextConfig
      return await _bundle(nextConfig)
    }

    return nextConfig
  } catch (error) {
    throw error
  }
}
