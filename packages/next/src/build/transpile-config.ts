import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import findUp from 'next/dist/compiled/find-up'
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
    mode: 'production',
    entry: nextConfigPath,
    experiments: {
      // Needed for output.libraryTarget: 'module'
      outputModule: isESM,
    },
    output: {
      filename: nextCompiledConfigName,
      path: distDir,
      libraryTarget: isESM ? 'module' : 'commonjs2',
    },
    // Set node.__dirname to true, and context to cwd.
    // This will ensure __dirname points to cwd not `.next`.
    // See https://webpack.js.org/configuration/node/#node__dirname
    node: {
      __dirname: true,
      // __filename will be `next.config.ts` instead of the original absolute path behavior.
      __filename: true,
    },
    context: cwd,
    // Resolve Node.js API like `fs`, and also allow to use ESM.
    target: ['node', 'es2020'],
    resolve: {
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
      plugins: [
        new JsConfigPathsPlugin(
          tsConfig.compilerOptions?.paths ?? {},
          resolvedBaseUrl
        ),
      ],
    },
    plugins: [new ProfilingPlugin({ runWebpackSpan, rootDir: cwd })],
    module: {
      rules: [
        {
          test: /\.(ts|mts)$/,
          exclude: /node_modules/,
          loader: require.resolve('./webpack/loaders/next-swc-loader'),
          options: {
            rootDir: cwd,
            isServer: false,
            hasReactRefresh: false,
            // Seems like no need to pass nextConfig to SWC loader
            nextConfig: {},
            jsConfig: tsConfig,
            swcCacheDir: join(distDir, 'cache', 'swc'),
            supportedBrowsers: undefined,
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

async function _transpileOnly({
  nextConfigPath,
  distDir,
}: {
  nextConfigPath: string
  distDir: string
}): Promise<NextConfig | undefined> {
  // Transpile by SWC to check if the config has `import` or `require`.
  const nextConfig = await readFile(nextConfigPath, 'utf8')
  const { code } = await transform(nextConfig, swcOptions)

  // Since the code is transpiled to CJS, we only need to check for require.
  // SWC will also drop types and unused imports.
  const hasNoImportOrRequire = !code.includes('require(')

  // Transpile-only if there's no import or require.
  // This will be the most common case and will avoid the need to run bundle.
  if (hasNoImportOrRequire) {
    const nextCompiledConfigPath = join(distDir, `next.compiled.config.cjs`)

    await mkdir(dirname(nextCompiledConfigPath), { recursive: true })
    await writeFile(nextCompiledConfigPath, code)

    return await import(nextCompiledConfigPath)
  }
}

export async function transpileConfig({
  isProd,
  nextConfigPath,
  nextConfigName,
  cwd,
}: {
  isProd: boolean
  nextConfigPath: string
  nextConfigName: string
  cwd: string
}): Promise<NextConfig> {
  // Since .next will be gitignored, it is OK to use it although distDir might be set on nextConfig.
  const distDir = join(cwd, '.next')

  // On production, use build cache if exists.
  if (isProd) {
    const preCompiledConfig = await findUp(
      [
        'next.compiled.config.cjs', // Transpile-only is the most-used case.
        'next.compiled.config.js',
        'next.compiled.config.mjs',
      ],
      {
        cwd: distDir,
      }
    )
    if (preCompiledConfig?.length) {
      return await import(preCompiledConfig)
    }
  }

  // Try transpile-only first to avoid running webpack.
  try {
    const nextCompiledConfig = await _transpileOnly({
      nextConfigPath,
      distDir,
    })
    if (nextCompiledConfig) {
      return nextCompiledConfig
    }
  } catch {}

  let tsConfig: any = {}
  let packageJson: any = {}
  try {
    // TODO: Use dynamic import when repo TS upgraded >= 5.3
    tsConfig = JSON.parse(await readFile(join(cwd, 'tsconfig.json'), 'utf8'))
    packageJson = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  } catch {}

  try {
    // package.json type: module or next.config.mts
    const isESM =
      extname(nextConfigName) === '.mts' || packageJson.type === 'module'

    // On CJS projects, importing Native ESM will need the config to be `.mjs`.
    // Therefore the config needs to be `next.config.mts`.
    // On ESM projects, it won't matter if the config is `.mjs` or `.js` in ESM format.
    const nextCompiledConfigName = `next.compiled.config${
      isESM ? '.mjs' : '.js'
    }`

    const resolvedBaseUrl = {
      // Use cwd if baseUrl is not set.
      baseUrl: join(cwd, tsConfig.compilerOptions?.baseUrl ?? ''),
      // If baseUrl is not set, it's implicit (cwd).
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

    const nextCompiledConfigPath = join(distDir, nextCompiledConfigName)
    return await import(nextCompiledConfigPath)
  } catch (error) {
    throw error
  }
}
