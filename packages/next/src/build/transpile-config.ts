import { dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { runCompiler } from './compiler'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
import { JsConfigPathsPlugin } from './webpack/plugins/jsconfig-paths-plugin'
import { trace } from '../trace'
import { hasNecessaryDependencies } from '../lib/has-necessary-dependencies'
import { getTypeScriptConfiguration } from '../lib/typescript/getTypeScriptConfiguration'
import type { ParsedCommandLine } from 'typescript'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type { SWCLoaderOptions } from './webpack/loaders/next-swc-loader'
import type { NextConfig } from '../server/config-shared'

export async function transpileConfig({
  configPath,
  configFileName,
  cwd,
}: {
  configPath: string
  configFileName: string
  cwd: string
}): Promise<NextConfig> {
  const isCJS = configFileName.endsWith('.cts')
  const filename = `next.compiled.config.${isCJS ? 'cjs' : 'mjs'}`

  let tsConfig: ParsedCommandLine
  try {
    const deps = await hasNecessaryDependencies(cwd, [
      {
        pkg: 'typescript',
        file: 'typescript/lib/typescript.js',
        exportsRestrict: true,
      },
    ])
    const typeScriptPath = deps.resolved.get('typescript')

    const ts = (await Promise.resolve(
      require(typeScriptPath!)
    )) as typeof import('typescript')

    tsConfig = await getTypeScriptConfiguration(
      ts,
      join(cwd, 'tsconfig.json'),
      true
    )
  } catch {
    tsConfig = { options: {} } as ParsedCommandLine
  }

  async function bundleConfig(nextConfig?: NextConfig): Promise<NextConfig> {
    const distDir = nextConfig?.distDir ?? '.next'
    const nextBuildSpan = trace('next-config-ts')
    const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
    const resolvedBaseUrl = tsConfig.options?.baseUrl
      ? {
          baseUrl: resolve(cwd, tsConfig.options.baseUrl),
          isImplicit: false,
        }
      : { baseUrl: dirname(configPath), isImplicit: true }

    const webpackConfig: webpack.Configuration = {
      mode: 'none',
      entry: configPath,
      experiments: {
        // Needed for output.libraryTarget: 'module'
        outputModule: !isCJS,
      },
      output: {
        filename,
        path: join(cwd, distDir),
        libraryTarget: isCJS ? 'commonjs2' : 'module',
      },
      resolve: {
        plugins: [
          new JsConfigPathsPlugin(
            tsConfig.options?.paths ?? {},
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
              esm: !isCJS,
            } satisfies SWCLoaderOptions,
          },
        ],
      },
    }

    // Support tsconfig baseUrl
    // Only add the baseUrl if it's explicitly set in tsconfig
    if (resolvedBaseUrl && !resolvedBaseUrl.isImplicit) {
      webpackConfig.resolve?.modules?.push(resolvedBaseUrl.baseUrl)
    }

    const [{ errors }] = await runCompiler(webpackConfig, {
      runWebpackSpan,
    })

    if (errors.length > 0) {
      throw new Error(errors[0].message)
    }

    const compiledConfigPath = join(cwd, distDir, filename)
    const compiledConfig = await import(pathToFileURL(compiledConfigPath).href)

    return compiledConfig.default
  }

  try {
    const nextConfig = await bundleConfig()

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
      return await bundleConfig(nextConfig)
    }

    return nextConfig
  } catch (error) {
    throw error
  }
}
