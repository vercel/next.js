import type { ChildProcess } from 'child_process'
import type { Server } from 'http'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import execa from 'execa'
import { isNextDeploy, nextTestSetup } from 'e2e-utils'
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

const isTurbopack = Boolean(process.env.IS_TURBOPACK_TEST)
// This test launches a second local Next.js server, which deployed fixtures cannot reach.
// Cache Components runs in an additional experimental mode that does not yet expose
// Turbopack's project-global federation endpoint.
const describeTurbopack =
  isTurbopack && !process.env.__NEXT_CACHE_COMPONENTS && !isNextDeploy
    ? describe
    : describe.skip

describeTurbopack('turbopack module federation between Next.js apps', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    dependencies: { '@module-federation/runtime-tools': '2.9.0' },
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
    // Deliberately resolve Next, React, and the optional federation peer from the parent
    // workspace instead of installing a node_modules directory in this nested app.
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
            // packages/next/types/global.d.ts narrows NODE_ENV, but the child must inherit none.
            NODE_ENV: undefined as NodeJS.ProcessEnv['NODE_ENV'],
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
    process.env.MF_REMOTE_URL = `${remoteOrigin}/_next/static/nested/nextRemote.js`

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
    if (webpackHostServer) {
      await new Promise<void>((resolve, reject) => {
        webpackHostServer.close((error) => (error ? reject(error) : resolve()))
      })
    }
    if (remoteServer) await killApp(remoteServer)
    delete process.env.MF_REMOTE_URL
  })

  it('loads a module exposed by another Next.js app', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
      expect(await browser.elementByCss('#remote-lazy-message').text()).toBe(
        'nested lazy from Next.js remote'
      )
    }, 15_000)

    const manifestResponse = await fetch(
      `${remoteOrigin}/_next/static/mf-manifest.json`
    )
    expect(manifestResponse.status).toBe(200)
    const manifest = (await manifestResponse.json()) as {
      id: string
      metaData: {
        publicPath: string
        remoteEntry: { name: string; path: string; type: string }
      }
      shared: Array<{ name: string; version: string; singleton: boolean }>
      remotes: unknown[]
      exposes: Array<{
        path: string
        assets: Record<'js' | 'css', { sync: string[]; async: string[] }>
      }>
    }
    expect(manifest.id).toBe('nextRemote')
    expect(manifest.metaData).toMatchObject({
      publicPath: 'auto',
      remoteEntry: { name: 'nextRemote.js', path: 'nested', type: 'global' },
    })
    expect(manifest.shared.map((item) => item.name).sort()).toEqual([
      'react',
      'shared-value',
    ])
    expect(
      manifest.shared.find((item) => item.name === 'shared-value')
    ).toMatchObject({
      version: '1.0.0',
      singleton: true,
    })
    expect(manifest.remotes).toEqual([])
    expect(manifest.exposes.map((expose) => expose.path).sort()).toEqual([
      './component',
      './composite',
      './message',
    ])
    expect(
      manifest.exposes.find((expose) => expose.path === './component')?.assets
        .css.sync.length
    ).toBeGreaterThan(0)
    expect(
      manifest.exposes.find((expose) => expose.path === './message')?.assets.js
        .async.length
    ).toBeGreaterThan(0)
    const composite = manifest.exposes.find(
      (expose) => expose.path === './composite'
    )
    expect(composite?.assets.js.sync.length).toBeGreaterThan(0)
    expect(composite?.assets.css.sync.length).toBeGreaterThan(0)
    for (const expose of manifest.exposes) {
      expect(expose.assets.js.sync.length).toBeGreaterThan(0)
      for (const type of ['js', 'css'] as const) {
        for (const file of [
          ...expose.assets[type].sync,
          ...expose.assets[type].async,
        ]) {
          expect(file).toMatch(/^chunks\/mf\//)
          expect(file).not.toContain('..')
          const assetResponse = await fetch(
            new URL(file, `${remoteOrigin}/_next/static/`)
          )
          expect(assetResponse.status).toBe(200)
        }
      }
    }

    // The exposed module lives in its own async chunk, fetched from the producer's origin
    // rather than from the host that loaded the remote entry.
    const remoteChunks = await browser.eval(
      `performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.startsWith(${JSON.stringify(remoteOrigin + '/_next/static/chunks/mf/')}) && !name.includes('/nested/nextRemote.js'))`
    )
    expect(remoteChunks).not.toEqual([])

    if (!isNextDev) {
      const sources = await Promise.all(
        [process.env.MF_REMOTE_URL!, ...(remoteChunks as string[])].map((url) =>
          fetch(url).then((response) => response.text())
        )
      )
      const federationOutput = sources.join('\n')
      expect(federationOutput).not.toContain(
        'MODULE_FEDERATION_UNUSED_EXPORT_SHOULD_BE_REMOVED'
      )
      expect(federationOutput).not.toContain('remote/lib/message.js')
    }
  })

  it('accepts named share scopes and concurrent enhanced initialization', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)
    const result = await browser.eval(`(async () => {
      const container = globalThis.nextRemote;
      const feature = Object.create(null);
      const secondary = Object.create(null);
      const options = {
        shareScopeKeys: ['feature', 'secondary'],
        shareScopeMap: { feature, secondary },
        version: '2.9.0'
      };
      const initScope = [];
      await Promise.all([
        container.init(feature, initScope, options),
        container.init(feature, initScope, options)
      ]);
      const factory = await container.get('./message', initScope);
      const sparse = { sparse: Object.create(null) };
      await container.init(sparse.sparse, [], { shareScopeKeys: ['sparse', 'missing'], shareScopeMap: sparse });
      let rejectedDifferentScope = false;
      try {
        await container.init(Object.create(null), [], { shareScopeKeys: 'feature' });
      } catch (error) {
        rejectedDifferentScope = error.message.includes('different share scope');
      }
      return { message: factory().message, rejectedDifferentScope, createdMissingScope: !!sparse.missing && sparse.missing !== sparse.sparse };
    })()`)
    expect(result).toEqual({
      message: 'hello from Next.js',
      rejectedDifferentScope: true,
      createdMissingScope: true,
    })
  })

  it('does not deadlock when a remote reenters its own init scope', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)
    await browser.eval(`(() => {
      const container = globalThis.nextRemote;
      const instance = globalThis.__FEDERATION__.__INSTANCES__.find((item) => item.name === 'nextRemote');
      const scope = Object.create(null);
      const initScope = [];
      const original = instance.initializeSharing;
      instance.initializeSharing = function (name, options) {
        instance.initializeSharing = original;
        return [
          ...original.call(this, name, options),
          container.init(scope, initScope, { shareScopeKeys: 'cyclic' })
        ];
      };
      globalThis.__cyclicInitStatus = 'pending';
      container.init(scope, initScope, { shareScopeKeys: 'cyclic' }).then(
        () => { globalThis.__cyclicInitStatus = 'resolved'; },
        (error) => { globalThis.__cyclicInitStatus = error.message; }
      );
    })()`)
    await retry(async () => {
      expect(await browser.eval(`globalThis.__cyclicInitStatus`)).toBe(
        'resolved'
      )
    }, 5_000)
  })

  it('exposes the module to a webpack host', async () => {
    const browser = await next.browser('/', { baseUrl: webpackHostOrigin })
    await retry(async () => {
      expect(await browser.elementByCss('#webpack-message').text()).toBe(
        'hello from Next.js'
      )
    }, 15_000)
  })

  if (isNextDev) {
    it('updates the manifest assets when an exposed lazy module changes', async () => {
      await writeFile(
        join(next.testDir, 'remote/lib/late.js'),
        "export const late = 'manifest refresh marker'\n"
      )
      expect(
        await readFile(join(next.testDir, 'remote/lib/late.js'), 'utf8')
      ).toContain('manifest refresh marker')
      await retry(async () => {
        const response = await fetch(
          `${remoteOrigin}/_next/static/mf-manifest.json`,
          { cache: 'no-store' }
        )
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as {
          exposes: Array<{
            path: string
            assets: { js: { async: string[] } }
          }>
        }
        const chunks = manifest.exposes.find(
          (expose) => expose.path === './message'
        )?.assets.js.async
        expect(chunks?.length).toBeGreaterThan(0)
        const contents = await Promise.all(
          chunks!.map(async (file) =>
            (
              await fetch(new URL(file, `${remoteOrigin}/_next/static/`), {
                cache: 'no-store',
              })
            ).text()
          )
        )
        expect(contents.join('\n')).toContain('manifest refresh marker')
      }, 20_000)
    })

    it('refreshes manifest CSS assets when an exposed style changes', async () => {
      await writeFile(
        join(next.testDir, 'remote/lib/component.css'),
        '.next-remote-component { color: fuchsia; }\n'
      )
      await retry(async () => {
        const response = await fetch(
          `${remoteOrigin}/_next/static/mf-manifest.json`,
          { cache: 'no-store' }
        )
        expect(response.status).toBe(200)
        const manifest = (await response.json()) as {
          exposes: Array<{
            path: string
            assets: { css: { sync: string[] } }
          }>
        }
        const chunks = manifest.exposes.find(
          (expose) => expose.path === './component'
        )?.assets.css.sync
        expect(chunks?.length).toBeGreaterThan(0)
        const contents = await Promise.all(
          chunks!.map(async (file) =>
            (
              await fetch(new URL(file, `${remoteOrigin}/_next/static/`), {
                cache: 'no-store',
              })
            ).text()
          )
        )
        expect(contents.join('\n')).toMatch(/fuchsia|#f0f/i)
      }, 20_000)
    })
  }
})
