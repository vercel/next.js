import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import type { Server } from 'http'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { findPort, retry, startStaticServer } from 'next-test-utils'

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
              './message': './message.js',
            },
            shared: worker
              ? {}
              : {
                  'shared-value': {
                    singleton: true,
                    requiredVersion: '^1.0.0',
                  },
                  'remote-shared': {
                    singleton: true,
                    version: '2.1.0',
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

const isTurbopack = !process.env.IS_WEBPACK_TEST && !process.env.NEXT_RSPACK
// This test launches a local webpack server, which deployed fixtures cannot reach.
const describeTurbopack =
  isTurbopack && !isNextDeploy ? describe : describe.skip

describeTurbopack('turbopack module federation with a webpack remote', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The separately launched webpack server is not reachable from a deployed fixture.
    skipDeployment: true,
  })
  let remoteServer: Server
  let sharedPackage: string

  beforeAll(async () => {
    const remotePort = await findPort()
    sharedPackage = join(next.testDir, 'node_modules', 'default-shared')
    await mkdir(sharedPackage, { recursive: true })
    await writeFile(
      join(sharedPackage, 'package.json'),
      JSON.stringify({
        name: 'default-shared',
        version: '1.0.0',
        main: 'index.js',
      })
    )
    await writeFile(
      join(sharedPackage, 'index.js'),
      `export const value = 'default shared fallback'`
    )
    const remoteOrigin = `http://localhost:${remotePort}`
    const remoteOutput = join(next.testDir, 'remote-dist')
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
    remoteServer = await startStaticServer(remoteOutput, undefined, remotePort)
    process.env.MF_REMOTE_ORIGIN = remoteOrigin
    process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN = remoteOrigin
    await next.start()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      remoteServer.close((error) => (error ? reject(error) : resolve()))
    })
    await rm(sharedPackage, { recursive: true, force: true })
    delete process.env.MF_REMOTE_ORIGIN
    delete process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN
  })

  it('loads a module exposed by webpack', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Turbopack host sharing'
      )
      expect(await browser.elementByCss('#host-shared-message').text()).toBe(
        'Turbopack host sharing'
      )
      expect(await browser.elementByCss('#shared-message').text()).toBe(
        'webpack remote sharing'
      )
      expect(await browser.elementByCss('#remote-shared-message').text()).toBe(
        'webpack remote sharing'
      )
      expect(await browser.elementByCss('#strict-error').text()).toContain(
        'No satisfying shared module for remote-shared'
      )
      expect(await browser.elementByCss('#fallback-message').text()).toBe(
        'local fallback sharing'
      )
      expect(await browser.elementByCss('#default-shared-message').text()).toBe(
        'default shared fallback'
      )
      expect(await browser.elementByCss('#worker-message').text()).toBe(
        'hello from webpack fallback'
      )
      expect(await browser.elementByCss('#remote-script-count').text()).toBe(
        '1'
      )
    })
  })
})
