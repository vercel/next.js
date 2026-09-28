import { join } from 'path'
import type { Server } from 'http'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { findPort, retry, startStaticServer } from 'next-test-utils'

const webpack = require('next/dist/compiled/webpack/webpack')
  .webpack as typeof import('webpack')

async function buildRemote(context: string, outputPath: string) {
  await new Promise<void>((resolve, reject) => {
    webpack(
      {
        mode: 'development',
        context,
        entry: {},
        output: {
          path: outputPath,
          publicPath: 'auto',
          uniqueName: 'webpack-catalog',
        },
        plugins: [
          new webpack.container.ModuleFederationPlugin({
            name: 'catalog',
            filename: 'remoteEntry.js',
            exposes: {
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

  beforeAll(async () => {
    const remotePort = await findPort()
    const remoteOutput = join(next.testDir, 'remote-dist')
    await buildRemote(join(next.testDir, 'remote'), remoteOutput)
    remoteServer = await startStaticServer(remoteOutput, undefined, remotePort)
    process.env.MF_REMOTE_URL = `http://localhost:${remotePort}/remoteEntry.js`
    await next.start()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      remoteServer.close((error) => (error ? reject(error) : resolve()))
    })
    delete process.env.MF_REMOTE_URL
  })

  it('loads a module exposed by webpack', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Turbopack host sharing'
      )
    })
  })
})
