import { unlink } from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { runCompiler } from './compiler'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { trace } from '../trace'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { SWCLoaderOptions } from './webpack/loaders/next-swc-loader'
import type { NextConfigComplete } from '../server/config-shared'

export async function transpileConfig({
  configPath,
  configFileName,
  cwd,
}: {
  configPath: string
  configFileName: string
  cwd: string
}) {
  const isCJS = configFileName.endsWith('.cts')
  const filename = `next.compiled.config.${isCJS ? 'cjs' : 'mjs'}`

  let tsConfig: any
  try {
    tsConfig = await import(pathToFileURL(`${cwd}/tsconfig.json`).href)
  } catch (error) {
    tsConfig = {}
  }

  async function bundleConfig(
    nextConfig?: NextConfigComplete
  ): Promise<string> {
    const nextBuildSpan = trace('next-config-ts', undefined, {
      buildMode: 'default',
      isTurboBuild: String(false),
      version: process.env.__NEXT_VERSION as string,
    })

    const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
    const webpackConfig: webpack.Configuration = {
      mode: 'development',
      entry: configPath,
      experiments: {
        // Needed for output.libraryTarget: 'module'
        outputModule: true,
      },
      output: {
        filename,
        path: cwd,
        libraryTarget: isCJS ? 'commonjs' : 'module',
      },
      resolve: {
        extensions: ['.ts'],
      },
      plugins: [new ProfilingPlugin({ runWebpackSpan, rootDir: cwd })],
      module: {
        rules: [
          {
            test: /\.ts$/,
            exclude: /node_modules/,
            loader: require.resolve('./webpack/loaders/next-swc-loader'),
            options: {
              rootDir: cwd,
              isServer: false,
              hasReactRefresh: false,
              nextConfig,
              jsConfig: tsConfig,
              swcCacheDir: join(
                cwd,
                nextConfig?.distDir ?? '.next',
                'cache',
                'swc'
              ),
              supportedBrowsers: undefined,
              esm: !isCJS,
            } satisfies SWCLoaderOptions,
          },
        ],
      },
    }

    const [{ errors, stats }] = await runCompiler(webpackConfig, {
      runWebpackSpan,
    })

    if (errors.length > 0) {
      throw new Error(errors[0].message)
    }

    if (stats?.hasErrors()) {
      throw new Error(stats.toString())
    }

    return join(cwd, filename)
  }

  let compiledConfigPath: string | undefined
  let nextConfig: any
  try {
    compiledConfigPath = await bundleConfig()
    nextConfig = await import(pathToFileURL(compiledConfigPath).href)

    if (nextConfig.default) {
      if (
        nextConfig.default?.modularizeImports ||
        nextConfig.default?.experimental?.optimizePackageImports ||
        nextConfig.default?.experimental?.swcPlugins ||
        nextConfig.default?.compiler ||
        nextConfig.default?.experimental?.optimizeServerReact ||
        nextConfig.default?.distDir
      ) {
        compiledConfigPath = await bundleConfig(nextConfig)
        nextConfig = await import(pathToFileURL(compiledConfigPath).href)
        return nextConfig
      }
    }

    return nextConfig
  } catch (error) {
    throw new Error(error as string)
  } finally {
    if (compiledConfigPath) await unlink(compiledConfigPath)
  }
}
