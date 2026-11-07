import type { ChildProcess } from 'child_process'
import { createServer, type Server } from 'http'
import { mkdir, readFile, rm, symlink, writeFile } from 'fs/promises'
import { join } from 'path'
import execa from 'execa'
import express from 'express'
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

// A second local server cannot be reached from a deployed Next.js fixture.
// Cache Components does not currently expose the project-global container endpoint.
const describeTurbopack =
  process.env.IS_TURBOPACK_TEST &&
  !process.env.__NEXT_CACHE_COMPONENTS &&
  !isNextDeploy
    ? describe
    : describe.skip

const buildScript = join(__dirname, 'build-rspack.mjs')
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
const useCompatibleNode =
  process.env.NEXT_TEST_FORCE_RSPACK_NODE === '1' ||
  !(
    (nodeMajor === 20 && nodeMinor >= 19) ||
    (nodeMajor === 22 && nodeMinor >= 12) ||
    nodeMajor >= 23
  )
const compatibleNodePackage =
  process.platform === 'linux' && ['x64', 'arm64'].includes(process.arch)
    ? `node-linux-${process.arch}`
    : process.platform === 'win32' && process.arch === 'x64'
      ? 'node-win-x64'
      : undefined
const rspackDependencies = {
  '@rspack/core': '2.0.4',
  '@module-federation/runtime-tools': '2.9.0',
  ...(useCompatibleNode && compatibleNodePackage
    ? { [compatibleNodePackage]: '20.19.5' }
    : {}),
}

async function buildRspack(
  testDir: string,
  kind: 'remote' | 'host',
  context: string,
  output: string,
  url: string,
  worker = false
) {
  const target = join(testDir, 'build-rspack.mjs')
  await writeFile(target, await readFile(buildScript))
  if (useCompatibleNode && !compatibleNodePackage) {
    throw new Error(
      `Rspack 2.0.4 needs Node 20.19+; no test binary is configured for ${process.platform}/${process.arch}`
    )
  }
  const nodeExecutable = useCompatibleNode
    ? join(
        testDir,
        'node_modules',
        compatibleNodePackage!,
        'bin',
        process.platform === 'win32' ? 'node.exe' : 'node'
      )
    : process.execPath
  await execa(
    nodeExecutable,
    [target, kind, context, output, url, worker ? 'worker' : 'browser'],
    { cwd: testDir }
  ).catch((error) => {
    throw new Error(
      `Rspack build failed: ${error.stderr || error.stdout || error.message}`
    )
  })
}

async function startCorsStaticServer(
  dir: string,
  port: number
): Promise<Server> {
  const app = express()
  app.use((request, response, next) => {
    if (request.path.endsWith('.json')) {
      response.setHeader('Access-Control-Allow-Origin', '*')
    }
    next()
  })
  app.use(express.static(dir))
  const server = createServer(app)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

function stopStaticServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    // Enhanced remotes may retain active connections after the browser has closed.
    server.closeAllConnections()
  })
}

describeTurbopack('Turbopack host and Rspack v2 remote', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '../turbopack-module-federation-webpack-remote'),
    dependencies: rspackDependencies,
    skipStart: true,
    skipDeployment: true,
  })
  let remoteServer: Server
  let remoteOrigin: string
  let remoteOutput: string
  let sharedPackage: string

  beforeAll(async () => {
    const port = await findPort()
    remoteOrigin = `http://localhost:${port}`
    remoteOutput = join(next.testDir, 'rspack-remote-dist')
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
    const context = join(next.testDir, 'remote')
    await Promise.all([
      writeFile(
        join(context, 'rspack-component.js'),
        "import './rspack-style.css'; export { default } from './component.js'\n"
      ),
      writeFile(
        join(context, 'rspack-style.css'),
        '.rspack-remote { color: royalblue }\n'
      ),
      writeFile(
        join(context, 'rspack-message.js'),
        "export * from './message.js'; export async function lazy() { return (await import('./rspack-late.js')).late }\n"
      ),
      writeFile(
        join(context, 'rspack-late.js'),
        "export const late = 'nested lazy from Rspack remote'\n"
      ),
    ])
    await buildRspack(
      next.testDir,
      'remote',
      context,
      join(remoteOutput, 'browser'),
      remoteOrigin
    )
    await buildRspack(
      next.testDir,
      'remote',
      context,
      join(remoteOutput, 'worker'),
      remoteOrigin,
      true
    )
    await writeFile(
      join(remoteOutput, 'browser', 'invalid-manifest.json'),
      JSON.stringify({ exposes: [] })
    )
    remoteServer = await startCorsStaticServer(remoteOutput, port)
    process.env.MF_REMOTE_ORIGIN = remoteOrigin
    process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN = remoteOrigin
    process.env.MF_REMOTE_MANIFEST = `${remoteOrigin}/browser/mf-manifest.json`
    process.env.NEXT_PUBLIC_MF_REMOTE_MANIFEST = process.env.MF_REMOTE_MANIFEST
    await writeFile(
      join(next.testDir, 'app', 'manifest-import.tsx'),
      await readFile(join(__dirname, 'manifest-host.tsx'))
    )
    await writeFile(
      join(next.testDir, 'app', 'page.tsx'),
      `import { RemoteMessage } from './remote-message'
import { ManifestImports } from './manifest-import'
export default function Page() { return <><RemoteMessage /><ManifestImports /></> }
`
    )
    await next.start()
  })

  afterAll(async () => {
    if (remoteServer) {
      await stopStaticServer(remoteServer)
    }
    if (sharedPackage) await rm(sharedPackage, { recursive: true, force: true })
    delete process.env.MF_REMOTE_ORIGIN
    delete process.env.NEXT_PUBLIC_MF_REMOTE_ORIGIN
    delete process.env.MF_REMOTE_MANIFEST
    delete process.env.NEXT_PUBLIC_MF_REMOTE_MANIFEST
  })

  it('loads exposed JS, React and worker modules with shared versions', async () => {
    const browser = await next.browser('/')
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'hello from Turbopack host sharing'
      )
      expect(
        await browser.elementByCss('#manifest-string-message').text()
      ).toBe('hello from Turbopack host sharing')
      expect(
        await browser.elementByCss('#manifest-object-message').text()
      ).toBe('hello from Turbopack host sharing')
      expect(
        await browser.elementByCss('#manifest-preloaded-message').text()
      ).toBe('hello from Turbopack host sharing')
      expect(
        await browser.elementByCss('#manifest-invalid-error').text()
      ).toMatch(/RUNTIME-013|not a valid federation manifest/)
      expect(
        await browser.elementByCss('#manifest-missing-error').text()
      ).toMatch(/RUNTIME-003|Failed to get manifest/)
      expect(await browser.elementByCss('#manifest-import-string').text()).toBe(
        'hello from Turbopack host sharing'
      )
      expect(await browser.elementByCss('#manifest-import-object').text()).toBe(
        'hello from Turbopack host sharing'
      )
      expect(await browser.elementByCss('#remote-react-component').text()).toBe(
        'next/dynamic from webpack remote'
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
    const chunks = await browser.eval(
      `performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.startsWith(${JSON.stringify(remoteOrigin + '/browser/')}) && !name.endsWith('remoteEntry.js'))`
    )
    expect(chunks).not.toEqual([])
    const manifestUrl = `${remoteOrigin}/browser/mf-manifest.json`
    const manifestResponse = await fetch(manifestUrl)
    expect(manifestResponse.headers.get('access-control-allow-origin')).toBe(
      '*'
    )
    const manifest = (await manifestResponse.json()) as {
      exposes: Array<{
        path: string
        assets: Record<'js' | 'css', { sync: string[]; async: string[] }>
      }>
    }
    const component = manifest.exposes.find(
      (expose) => expose.path === './component'
    )
    const message = manifest.exposes.find(
      (expose) => expose.path === './message'
    )
    expect(component?.assets.css.sync.length).toBeGreaterThan(0)
    expect(message?.assets.js.async.length).toBeGreaterThan(0)
    const resourceUrls = (await browser.eval(
      `performance.getEntriesByType('resource').map((entry) => entry.name)`
    )) as string[]
    expect(
      resourceUrls.some((url) => url.includes('/browser/mf-manifest.json'))
    ).toBe(true)
    for (const file of [
      ...(component?.assets.css.sync || []),
      ...(message?.assets.js.async || []),
    ]) {
      expect(resourceUrls.some((url) => url.includes(`/browser/${file}`))).toBe(
        true
      )
    }
  })

  it('loads a rebuilt Rspack remote after a browser reload', async () => {
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
    await buildRspack(
      next.testDir,
      'remote',
      join(next.testDir, 'remote'),
      join(remoteOutput, 'browser'),
      remoteOrigin
    )
    await browser.refresh()
    await retry(async () => {
      expect(await browser.elementByCss('#remote-message').text()).toBe(
        'updated from Turbopack host sharing'
      )
    })
  })

  it('rejects imports in Node and Edge server code', async () => {
    expect((await next.fetch('/server-import')).status).toBe(500)
    await retry(() => {
      expect(next.cliOutput).toContain(
        'External script loading is only supported in browser client code'
      )
    })

    const outputBeforeEdge = next.cliOutput.length
    expect((await next.fetch('/edge-import')).status).toBe(500)
    await retry(() => {
      expect(next.cliOutput.slice(outputBeforeEdge)).toContain(
        'Failed to load federated module catalog/message:'
      )
    })
  })
})

describeTurbopack('Rspack v2 host and Turbopack remote', () => {
  const { next, isNextDev } = nextTestSetup({
    files: join(__dirname, '../turbopack-module-federation-next-remote'),
    dependencies: rspackDependencies,
    skipStart: true,
    skipDeployment: true,
  })
  let remoteServer: ChildProcess
  let remoteOrigin: string
  let manifestUrl: string
  let rspackHostServer: Server
  let rspackHostOrigin: string

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
    manifestUrl = `${remoteOrigin}/_next/static/mf-manifest.json`

    const hostPort = await findPort()
    rspackHostOrigin = `http://localhost:${hostPort}`
    const hostOutput = join(next.testDir, 'rspack-v2-host-dist')
    await buildRspack(
      next.testDir,
      'host',
      join(next.testDir, 'webpack-host'),
      hostOutput,
      manifestUrl
    )
    await writeFile(
      join(hostOutput, 'index.html'),
      '<p id="webpack-message">loading</p><script src="/main.js"></script>'
    )
    rspackHostServer = await startStaticServer(hostOutput, undefined, hostPort)
    await next.start()
  })

  afterAll(async () => {
    if (rspackHostServer) {
      await stopStaticServer(rspackHostServer)
    }
    if (remoteServer) await killApp(remoteServer)
    delete process.env.MF_REMOTE_URL
  })

  it('loads a Turbopack expose from an enhanced Rspack host', async () => {
    const manifestResponse = await fetch(manifestUrl)
    expect(manifestResponse.status).toBe(200)
    expect(manifestResponse.headers.get('access-control-allow-origin')).toBe(
      '*'
    )
    const browser = await next.browser('/', { baseUrl: rspackHostOrigin })
    await retry(async () => {
      expect(await browser.elementByCss('#webpack-message').text()).toBe(
        'hello from Next.js'
      )
      expect(await browser.elementByCss('#manifest-composite').text()).toBe(
        'hello from Next.js'
      )
      expect(await browser.elementByCss('#next-remote-react').text()).toBe(
        'React hook from Next.js remote'
      )
      expect(
        await browser.elementByCss('#next-remote-shared-value').text()
      ).toBe('Rspack host shared value')
    }, 15_000)
    const assets = await browser.eval(
      `performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.startsWith(${JSON.stringify(remoteOrigin + '/_next/static/chunks/mf/')}) && !name.endsWith('nextRemote.js'))`
    )
    expect(assets).not.toEqual([])
    expect(
      await browser.eval(
        `performance.getEntriesByType('resource').some((entry) => entry.name.startsWith(${JSON.stringify(manifestUrl)}))`
      )
    ).toBe(true)
  })
})
