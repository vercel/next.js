import { join } from 'path'
import { runCompiler } from './compiler'
import { trace } from '../trace'
import { ProfilingPlugin } from './webpack/plugins/profiling-plugin'
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
}): Promise<string> {
  const isCJS = configFileName.endsWith('.cts')
  const filename = `next.compiled.config.${isCJS ? 'cjs' : 'mjs'}`

  try {
    const nextBuildSpan = trace('next-config-ts', undefined, {
      buildMode: 'default',
      isTurboBuild: String(false),
      version: process.env.__NEXT_VERSION as string,
    })

    const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
    const webpackConfig: webpack.Configuration = {
      mode: 'none',
      entry: configPath,
      output: {
        filename,
        path: cwd,
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
              nextConfig: {} as NextConfigComplete,
              jsConfig: {
                compilerOptions: {
                  lib: ['dom', 'dom.iterable', 'esnext'],
                  allowJs: true,
                  skibLibCheck: true,
                  strict: false,
                  noEmit: true,
                  incremental: true,
                  include: [
                    'next-env.d.ts',
                    '.next/types/**/*.ts',
                    '**/*.ts',
                    '**/*.tsx',
                  ],
                  plugins: [{ name: 'next' }],
                  exclude: ['node_modules'],
                  esModuleInterop: true,
                  module: 'esnext',
                  moduleResolution: 'node',
                  resolveJsonModule: true,
                  isolatedModules: true,
                },
              },
              // nextConfig.distDir
              swcCacheDir: join(cwd, '.next', 'cache', 'swc'),
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
  } catch (error) {
    throw new Error(error as string)
  }

  return join(cwd, filename)
}
