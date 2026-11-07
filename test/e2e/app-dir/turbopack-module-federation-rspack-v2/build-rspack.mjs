// Run inside the isolated Next.js test install, not the Jest process: the
// repository itself intentionally depends on a different @rspack/core version.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const requireFromApp = createRequire(join(process.cwd(), 'package.json'))
const rspack = await import(
  pathToFileURL(requireFromApp.resolve('@rspack/core')).href
)
const { version: rspackVersion } = requireFromApp('@rspack/core/package.json')
const { version: runtimeVersion } = requireFromApp(
  '@module-federation/runtime-tools/package.json'
)
if (rspackVersion !== '2.0.4' || runtimeVersion !== '2.9.0') {
  throw new Error(
    `Unexpected federation toolchain: ${rspackVersion} / ${runtimeVersion}`
  )
}

const [kind, context, outputPath, remoteUrl, workerArg] = process.argv.slice(2)
await new Promise((resolve, reject) => {
  const isRemote = kind === 'remote'
  const worker = workerArg === 'worker'
  rspack.rspack(
    {
      mode: 'development',
      context,
      target: worker ? 'webworker' : 'web',
      entry: isRemote ? {} : './rspack-react.js',
      module: { rules: [{ test: /\.css$/, type: 'css' }] },
      output: {
        path: outputPath,
        publicPath: isRemote
          ? `${remoteUrl}/${worker ? 'worker' : 'browser'}/`
          : 'auto',
        uniqueName: isRemote
          ? worker
            ? 'rspack-v2-worker-catalog'
            : 'rspack-v2-catalog'
          : 'rspack-v2-next-host',
        ...(isRemote
          ? {
              chunkLoading: worker ? 'import-scripts' : 'jsonp',
              globalObject: 'globalThis',
            }
          : {}),
      },
      plugins: [
        new rspack.container.ModuleFederationPlugin(
          isRemote
            ? {
                name: worker ? 'workerCatalog' : 'catalog',
                filename: 'remoteEntry.js',
                manifest: !worker,
                exposes: {
                  './component': worker
                    ? './component.js'
                    : './rspack-component.js',
                  './message': worker ? './message.js' : './rspack-message.js',
                },
                shared: worker
                  ? {}
                  : {
                      react: { singleton: true, requiredVersion: false },
                      'shared-value': {
                        singleton: true,
                        requiredVersion: '^1.0.0',
                      },
                      'remote-shared': {
                        singleton: true,
                        version: '2.1.0',
                      },
                    },
              }
            : {
                name: 'rspackV2Host',
                remotes: { nextRemote: `nextRemote@${remoteUrl}` },
                shared: {
                  react: {
                    singleton: true,
                    eager: true,
                    requiredVersion: false,
                  },
                  'react-dom': {
                    singleton: true,
                    eager: true,
                    requiredVersion: false,
                  },
                  'shared-value': {
                    import: './shared-value.js',
                    version: '2.0.0',
                    singleton: true,
                    eager: true,
                    requiredVersion: false,
                  },
                },
              }
        ),
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
