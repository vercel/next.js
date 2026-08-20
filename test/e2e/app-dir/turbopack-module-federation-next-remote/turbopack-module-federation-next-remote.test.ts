import type { ChildProcess } from 'child_process'
import type { Server } from 'http'
import { symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import execa from 'execa'
import { nextTestSetup } from 'e2e-utils'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextStart,
  retry,
  startStaticServer,
} from 'next-test-utils'

const webpack = require('next/dist/compiled/webpack/webpack')
  .webpack as typeof import('webpack')

async function buildWebpackHost(
  context: string,
  outputPath: string,
  remoteUrl: string
) {
  await new Promise<void>((resolve, reject) => {
    webpack(
      {
        mode: 'development',
        context,
        entry: './index.js',
        output: {
          path: outputPath,
          publicPath: 'auto',
          uniqueName: 'webpack-host',
        },
        plugins: [
          new webpack.container.ModuleFederationPlugin({
            name: 'webpackHost',
            remotes: {
              nextRemote: `nextRemote@${remoteUrl}`,
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
  await writeFile(
    join(outputPath, 'index.html'),
    '<p id="webpack-message">loading</p><script src="/main.js"></script>'
  )
}

describe('turbopack module federation between Next.js apps', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // A second local Next.js server is not reachable from a deployed fixture.
    skipDeployment: true,
  })
  let remoteServer: ChildProcess
  let remoteOrigin: string
  let webpackHostServer: Server
  let webpackHostOrigin: string

  beforeAll(async () => {
    const remotePort = await findPort()
    remoteOrigin = `http://localhost:${remotePort}`
    const remoteDir = join(next.testDir, 'remote')
    await symlink(
      join(next.testDir, 'node_modules'),
      join(remoteDir, 'node_modules')
    )
    if (isNextDev) {
      remoteServer = await launchApp(remoteDir, remotePort)
    } else {
      await execa(
        'node',
        [join(next.testDir, 'node_modules/next/dist/bin/next'), 'build'],
        {
          cwd: remoteDir,
          env: {
            ...process.env,
            NEXT_TEST_MODE: undefined,
            NODE_ENV: undefined,
            __NEXT_SHOW_IGNORE_LISTED: 'true',
          },
        }
      )
      remoteServer = await nextStart(remoteDir, remotePort, {
        disableAutoSkewProtection: true,
      })
    }
    const response = await fetchViaHTTP(remotePort, '/')
    if (response.status !== 200) {
      throw new Error(`Remote server returned status ${response.status}`)
    }

    process.env.MF_REMOTE_URL = `${remoteOrigin}/_next/static/chunks/nested/nextRemote.js`

    const webpackHostPort = await findPort()
    webpackHostOrigin = `http://localhost:${webpackHostPort}`
    const webpackHostOutput = join(next.testDir, 'webpack-host-dist')
    await buildWebpackHost(
      join(next.testDir, 'webpack-host'),
      webpackHostOutput,
      process.env.MF_REMOTE_URL
    )
    webpackHostServer = await startStaticServer(
      webpackHostOutput,
      undefined,
      webpackHostPort
    )

    await next.start()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      webpackHostServer.close((error) => (error ? reject(error) : resolve()))
    })
    await killApp(remoteServer)
    delete process.env.MF_REMOTE_URL
  })

  it('loads a module exposed by another Next.js app', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)

    // The exposed module lives in its own async chunk, fetched from the producer's origin
    // rather than from the host that loaded the remote entry.
    const remoteChunks = await browser.eval(
      `performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.startsWith(${JSON.stringify(remoteOrigin + '/_next/static/chunks/')}) && !name.includes('/nested/nextRemote.js'))`
    )
    expect(remoteChunks).not.toEqual([])
  })

  it('exposes the module to a webpack host', async () => {
    const browser = await next.browser('/', { baseUrl: webpackHostOrigin })
    await retry(async () => {
      expect(await browser.elementByCss('#webpack-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)
  })
})
