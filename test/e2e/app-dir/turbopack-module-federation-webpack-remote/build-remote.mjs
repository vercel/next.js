import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Runs outside Jest because `@rspack/core` v2 is ESM-only.
const require = createRequire(import.meta.url)
const testDir = dirname(fileURLToPath(import.meta.url))
const [producer, remoteOrigin] = process.argv.slice(2)
const isRspack = producer === 'rspack-v2'
const bundler = isRspack
  ? (await import('@rspack/core')).rspack
  : require('next/dist/compiled/webpack/webpack').webpack

async function buildRemote(context, outputPath, worker = false) {
  await new Promise((resolve, reject) => {
    bundler(
      {
        mode: 'development',
        context,
        target: worker ? 'webworker' : 'web',
        entry: {},
        output: {
          path: outputPath,
          publicPath: `${remoteOrigin}/${worker ? 'worker' : 'browser'}/`,
          uniqueName: worker ? 'webpack-worker-catalog' : 'webpack-catalog',
          chunkLoading: worker ? 'import-scripts' : 'jsonp',
          globalObject: 'globalThis',
        },
        plugins: [
          new bundler.container.ModuleFederationPlugin({
            ...(isRspack && {
              implementation: require.resolve(
                '@module-federation/runtime-tools'
              ),
            }),
            name: worker ? 'workerCatalog' : 'catalog',
            filename: 'remoteEntry.js',
            exposes: {
              './component': './component.js',
              './message': './message.js',
            },
            shared: {
              'shared-value': {
                singleton: true,
                requiredVersion: '^1.0.0',
              },
            },
          }),
        ],
      },
      (error, stats) => {
        if (error) return reject(error)
        if (stats?.hasErrors()) {
          return reject(new Error(stats.toString({ errors: true })))
        }
        resolve()
      }
    )
  })
}

const remoteOutput = join(testDir, 'remote-dist')
const remoteContext = join(testDir, 'remote')
await buildRemote(remoteContext, join(remoteOutput, 'browser'))
await buildRemote(remoteContext, join(remoteOutput, 'worker'), true)
await copyFile(
  join(remoteContext, 'fallback.js'),
  join(remoteOutput, 'fallback.js')
)
