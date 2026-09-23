import { join } from 'path'
import { copyFile } from 'fs/promises'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry, startStaticServer } from 'next-test-utils'

const webpack = require('next/dist/compiled/webpack/webpack')
  .webpack as typeof import('webpack')

async function buildRemote(
  context: string,
  outputPath: string,
  remoteOrigin: string,
  worker = false
) {
  await new Promise<void>((resolve, reject) => {
    webpack(
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
          new webpack.container.ModuleFederationPlugin({
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

const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
// This test launches a local webpack server, which deployed fixtures cannot reach.
// Cache Components runs in an additional experimental mode that does not yet expose
// Turbopack's project-global federation endpoint.
const describeTurbopack =
  isTurbopack && !process.env.__NEXT_CACHE_COMPONENTS && !isNextDeploy
    ? describe
    : describe.skip

describeTurbopack.each([
  ['native', ''],
  ['runtime-tools package', '@module-federation/runtime-tools'],
  ['runtime-tools resolved entry', 'resolved'],
])(
  'turbopack module federation with a webpack remote using %s',
  (_, implementation) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // The separately launched webpack server is not reachable from a deployed fixture.
      skipDeployment: true,
      dependencies: {
        '@module-federation/runtime-tools': '2.9.0',
      },
    })
    let remoteServer: Server

    beforeAll(async () => {
      const remoteOutput = join(next.testDir, 'remote-dist')
      remoteServer = await startStaticServer(remoteOutput)
      const remotePort = (remoteServer.address() as AddressInfo).port
      const remoteOrigin = `http://localhost:${remotePort}`
      const remoteContext = join(next.testDir, 'remote')
      await buildRemote(
        remoteContext,
        join(remoteOutput, 'browser'),
        remoteOrigin
      )
      await buildRemote(
        remoteContext,
        join(remoteOutput, 'worker'),
        remoteOrigin,
        true
      )
      await copyFile(
        join(remoteContext, 'fallback.js'),
        join(remoteOutput, 'fallback.js')
      )
      process.env.MF_REMOTE_ORIGIN = remoteOrigin
      process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN = remoteOrigin
      process.env.MF_IMPLEMENTATION = implementation
      process.env.NEXT_PUBLIC_MF_IMPLEMENTATION = implementation
      await next.start()
    })

    afterAll(async () => {
      if (remoteServer) {
        await new Promise<void>((resolve, reject) => {
          remoteServer.close((error) => (error ? reject(error) : resolve()))
          remoteServer.closeAllConnections()
        })
      }
      delete process.env.MF_REMOTE_ORIGIN
      delete process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN
      delete process.env.MF_IMPLEMENTATION
      delete process.env.NEXT_PUBLIC_MF_IMPLEMENTATION
    })

    it('loads a module exposed by webpack', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#remote-message').text()).toBe(
          'hello from Turbopack host sharing'
        )
        expect(
          await browser.elementByCss('#remote-react-component').text()
        ).toBe('next/dynamic from webpack remote')
        expect(await browser.elementByCss('#worker-message').text()).toBe(
          'hello from Turbopack host sharing'
        )
        expect(await browser.elementByCss('#remote-script-count').text()).toBe(
          '1'
        )
        expect(await browser.elementByCss('#fallback-message').text()).toBe(
          'hello from Turbopack host sharing'
        )
        if (implementation) {
          expect(await browser.elementByCss('#async-message').text()).toBe(
            'async factory result'
          )
        }
      })
      if (implementation) {
        expect(
          await browser.eval(() => {
            const global = window as any
            const instances = global.__FEDERATION__.__INSTANCES__
            return {
              names: instances.map((instance) => instance.options.name),
              sameShareScope:
                instances[0].shareScopeMap.default ===
                global.fallbackShareScope,
              asyncFactoryCalls: global.asyncFactoryCalls,
              sharedVersions: Object.keys(
                instances[0].shareScopeMap.default['shared-value']
              ).sort(),
            }
          })
        ).toEqual({
          names: ['nextHost'],
          sameShareScope: true,
          asyncFactoryCalls: 1,
          sharedVersions: ['1.0.0', '1.2.0'],
        })
      }
    })
  }
)
