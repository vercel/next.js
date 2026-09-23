import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const testDir = dirname(fileURLToPath(import.meta.url))
const [producer, remoteOrigin] = process.argv.slice(2)
const bundler =
  producer === 'rspack-v2'
    ? (await import('@rspack/core')).rspack
    : require('next/dist/compiled/webpack/webpack').webpack

for (const worker of [false, true]) {
  await new Promise((resolve, reject) => {
    bundler(
      {
        mode: 'development',
        context: join(testDir, 'remote'),
        target: worker ? 'webworker' : 'web',
        entry: {},
        output: {
          path: join(testDir, 'remote-dist', worker ? 'worker' : 'browser'),
          publicPath: `${remoteOrigin}/${worker ? 'worker' : 'browser'}/`,
          uniqueName: `${producer}-${worker ? 'worker-catalog' : 'catalog'}`,
          chunkLoading: worker ? 'import-scripts' : 'jsonp',
          globalObject: 'globalThis',
        },
        plugins: [
          new bundler.container.ModuleFederationPlugin({
            ...(producer === 'rspack-v2'
              ? {
                  implementation: require.resolve(
                    '@module-federation/runtime-tools'
                  ),
                }
              : {}),
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
