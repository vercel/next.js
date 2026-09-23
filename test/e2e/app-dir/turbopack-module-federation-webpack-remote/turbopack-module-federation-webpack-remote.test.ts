import { join } from 'path'
import { copyFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Server } from 'http'
import type { AddressInfo } from 'net'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
import { retry, startStaticServer } from 'next-test-utils'

const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
// This test launches a local remote server, which deployed fixtures cannot reach.
// Cache Components runs in an additional experimental mode that does not yet expose
// Turbopack's project-global federation endpoint.
const describeTurbopack =
  isTurbopack && !process.env.__NEXT_CACHE_COMPONENTS && !isNextDeploy
    ? describe
    : describe.skip

describeTurbopack.each([
  ['webpack-v1', 'native', ''],
  ['webpack-v1', 'runtime-tools package', '@module-federation/runtime-tools'],
  ['webpack-v1', 'runtime-tools resolved entry', 'resolved'],
  ['rspack-v2', 'native', ''],
  ['rspack-v2', 'runtime-tools package', '@module-federation/runtime-tools'],
] as const)(
  'turbopack module federation with a %s remote using %s',
  (producer, _, implementation) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      // The separately launched remote server is not reachable from a deployed fixture.
      skipDeployment: true,
      dependencies: {
        '@module-federation/runtime-tools': '2.9.0',
        ...(producer === 'rspack-v2' ? { '@rspack/core': '2.2.6' } : {}),
      },
    })
    let remoteServer: Server

    beforeAll(async () => {
      const remoteOutput = join(next.testDir, 'remote-dist')
      remoteServer = await startStaticServer(remoteOutput)
      const remotePort = (remoteServer.address() as AddressInfo).port
      const remoteOrigin = `http://localhost:${remotePort}`
      const remoteContext = join(next.testDir, 'remote')
      await promisify(execFile)(process.execPath, [
        join(next.testDir, 'build-remote.mjs'),
        producer,
        remoteOrigin,
      ])
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

    it('loads exposed modules and shares host values in browsers and workers', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        expect(await browser.elementByCss('#remote-message').text()).toBe(
          'hello from Turbopack host sharing'
        )
        expect(
          await browser.elementByCss('#remote-react-component').text()
        ).toBe('next/dynamic from federated remote')
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
          expect(await browser.elementByCss('#isolated-message').text()).toBe(
            'hello from isolated SDK host'
          )
        }
      })
      if (implementation) {
        expect(
          await browser.eval(() => {
            const global = window as any
            const hosts = global.__FEDERATION__.__INSTANCES__.filter(
              (instance) => instance.options.name === 'nextHost'
            )
            return {
              names: hosts.map((instance) => instance.options.name),
              sameShareScope:
                hosts[0].shareScopeMap.default === global.fallbackShareScope,
              asyncFactoryCalls: global.asyncFactoryCalls,
              sharedVersions: Object.keys(
                hosts[0].shareScopeMap.default['shared-value']
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
      if (producer === 'rspack-v2') {
        expect(
          await browser.eval(() => {
            const global = window as any
            const producers = global.__FEDERATION__.__INSTANCES__.filter(
              (instance) => instance.options.name === 'catalog'
            )
            return {
              names: producers.map((instance) => instance.options.name),
              sameShareScope:
                producers[0].shareScopeMap.default ===
                global.fallbackShareScope,
              sharedVersions: Object.keys(
                producers[0].shareScopeMap.default['shared-value']
              ).sort(),
            }
          })
        ).toEqual({
          names: ['catalog'],
          sameShareScope: true,
          sharedVersions: implementation
            ? ['1.0.0', '1.2.0']
            : expect.arrayContaining(['1.0.0', '1.2.0']),
        })
        expect(
          JSON.parse(await browser.elementByCss('#worker-runtime').text())
        ).toEqual({
          names: implementation
            ? ['nextHost', 'workerCatalog']
            : ['workerCatalog'],
          sameShareScope: true,
          sharedVersions: implementation
            ? ['1.0.0', '1.2.0']
            : expect.arrayContaining(['1.0.0', '1.2.0']),
        })
      }
    })
  }
)
