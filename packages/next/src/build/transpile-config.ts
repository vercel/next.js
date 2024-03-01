import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
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

async function _runWebpack({
  nextConfigPath,
  nextCompiledConfigName,
  cwd,
  distDir,
  isESM,
  resolvedBaseUrl,
  tsConfig,
}: {
  nextConfigPath: string
  nextCompiledConfigName: string
  cwd: string
  distDir: string
  isESM: boolean
  resolvedBaseUrl: { baseUrl: string; isImplicit: boolean }
  tsConfig: any
}): Promise<void> {
  const nextBuildSpan = trace('next-config-ts')
  const runWebpackSpan = nextBuildSpan.traceChild('run-webpack-compiler')
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
      extensions: ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'],
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
            // Seems like no need to pass nextConfig to SWC loader
            nextConfig: {},
            jsConfig: tsConfig,
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
}

export async function transpileConfig({
  nextConfigPath,
  nextConfigName,
  cwd,
}: {
  nextConfigPath: string
  nextConfigName: string
  cwd: string
}): Promise<NextConfig> {
  let tsConfig: any = {}
  let packageJson: any = {}
  try {
    // TODO: Use dynamic import when repo TS upgraded >= 5.3
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  // package.json type: module or next.config.mts
  const isESM =
    extname(nextConfigName) === '.mts' || packageJson.type === 'module'

  // On CJS projects, importing Native ESM will need the config to be `.mjs`.
  // Therefore the config needs to be `next.config.mts`.
  // On ESM projects, it won't matter if the config is `.mjs` or `.js` in ESM format.
  const nextCompiledConfigName = `next.compiled.config${isESM ? '.mjs' : '.js'}`

  // Since .next will be gitignored, it is OK to use it although distDir might be set on nextConfig.
  const distDir = '.next'

  try {
    // Transpile by SWC to check if the config has `import` or `require`.
    const nextConfigTS = await readFile(nextConfigPath, 'utf8')
    const { code } = await transform(nextConfigTS, swcOptions)

    // Since the code is transpiled to CJS, we only need to check for require.
    // SWC will also drop types and unused imports.
    const hasNoImportOrRequire = !code.includes('require(')

    // Transpile-only if there's no import or require.
    // This will be the most common case and will avoid the need to run bundle.
    if (hasNoImportOrRequire) {
      const transpiledNextConfigPath = join(
        cwd,
        distDir,
        `next.compiled.config.cjs`
      )

      await mkdir(dirname(transpiledNextConfigPath), { recursive: true })
      await writeFile(transpiledNextConfigPath, code)

      const transpiledNextConfig = await import(transpiledNextConfigPath)
      return transpiledNextConfig.default ?? transpiledNextConfig
    }

    const resolvedBaseUrl = {
      // Use cwd if baseUrl is not set
      baseUrl: join(cwd, tsConfig.compilerOptions?.baseUrl ?? ''),
      // If baseUrl is not set, it's implicit (cwd)
      isImplicit: Boolean(!tsConfig.compilerOptions?.baseUrl),
    }

    await _runWebpack({
      nextConfigPath,
      nextCompiledConfigName,
      cwd,
      distDir,
      isESM,
      resolvedBaseUrl,
      tsConfig,
    })

    const nextCompiledConfigPath = join(cwd, distDir, nextCompiledConfigName)
    const nextCompiledConfig = await import(nextCompiledConfigPath)

    // For named-exported configs, we do not supoort it but proceeds as something like:
    //  ⚠ Invalid next.config.ts options detected:
    //  ⚠     Unrecognized key(s) in object: 'config'
    // So we try to return the default if exits, otherwise return-
    // the whole object as is to prevent returning undefined and preserve the current behavior
    return nextCompiledConfig.default ?? nextCompiledConfig
  } catch (error) {
    throw error
  }
}
