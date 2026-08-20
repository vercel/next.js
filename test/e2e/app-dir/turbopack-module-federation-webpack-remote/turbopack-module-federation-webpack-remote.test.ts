import { join } from 'path'
import type { Server } from 'http'
import { nextTestSetup } from 'e2e-utils'
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

describe('turbopack module federation with a webpack remote', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The separately launched webpack server is not reachable from a deployed fixture.
    skipDeployment: true,
  })
  let remoteServer: Server
  let remoteDir: string
  let remoteOutput: string

  beforeAll(async () => {
    const remotePort = await findPort()
    remoteDir = join(next.testDir, 'remote')
    remoteOutput = join(next.testDir, 'remote-dist')
    await buildRemote(remoteDir, remoteOutput)
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
      expect(await browser.elementByCss('#union-range').text()).toBe(
        'range v1.5.0'
      )
      expect(await browser.elementByCss('#hyphen-range').text()).toBe(
        'range v2.3.0'
      )
      expect(await browser.elementByCss('#caret-range').text()).toBe(
        'range v1.5.0'
      )
      expect(await browser.elementByCss('#prefix-fallback').text()).toBe(
        'prefix fallback sharing'
      )
      expect(await browser.elementByCss('#eager-value').text()).toBe(
        'eager local sharing'
      )
    })
  })

  it('loads a rebuilt remote after a browser reload', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Turbopack host sharing'
      )
    })

    await next.patchFile(
      'remote/message.js',
      `import { value } from 'shared-value'
import { value as remoteShared } from 'remote-shared'

export const message = \`updated from \${value}\`
export { remoteShared }
`
    )
    await buildRemote(remoteDir, remoteOutput)
    await browser.refresh()

    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'updated from Turbopack host sharing'
      )
    })
  })

  it('rejects a federated import from server code', async () => {
    const response = await next.fetch('/server-import')
    expect(response.status).toBe(500)
    await retry(() => {
      expect(next.cliOutput).toContain(
        'Module Federation remote imports cannot run on the server'
      )
    })
  })

  it('rejects a federated import from the Edge runtime', async () => {
    const response = await next.fetch('/edge-import')
    expect(response.status).toBe(500)
    await retry(() => {
      expect(next.cliOutput).toContain(
        'Module Federation remote imports must run in browser client code'
      )
    })
  })
})
