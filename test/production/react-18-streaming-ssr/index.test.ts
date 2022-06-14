import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

const react18Deps = {
  react: '^18.0.0',
  'react-dom': '^18.0.0',
}

describe('react 18 streaming SSR and RSC in minimal mode', () => {
  let next: NextInstance

  beforeAll(async () => {
    process.env.NEXT_PRIVATE_MINIMAL_MODE = '1'

    next = await createNext({
      files: {
        'pages/index.server.js': `
          export default function Page() {
            return <p>streaming</p>
          }
          export async function getServerSideProps() {
            return { props: {} }
          }
        `,
      },
      nextConfig: {
        experimental: {
          serverComponents: true,
          runtime: 'nodejs',
        },
        webpack(config, { nextRuntime }) {
          const path = require('path')
          const fs = require('fs')

          const runtimeFilePath = path.join(__dirname, 'runtimes.txt')
          let runtimeContent = ''

          try {
            runtimeContent = fs.readFileSync(runtimeFilePath, 'utf8')
            runtimeContent += '\n'
          } catch (_) {}

          runtimeContent += nextRuntime || 'client'

          fs.writeFileSync(runtimeFilePath, runtimeContent)
          return config
        },
      },
      dependencies: react18Deps,
    })
  })
  afterAll(() => {
    delete process.env.NEXT_PRIVATE_MINIMAL_MODE
    next.destroy()
  })

  it('should pass correct nextRuntime values', async () => {
    const content = await next.readFile('runtimes.txt')
    expect(content.split('\n').sort()).toEqual(['client', 'edge', 'nodejs'])
  })

  it('should generate html response by streaming correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('streaming')
  })

  it('should have generated a static 404 page', async () => {
    expect(await next.readFile('.next/server/pages/404.html')).toBeTruthy()

    const res = await fetchViaHTTP(next.url, '/non-existent')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })
})

describe('react 18 streaming SSR with custom next configs', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'streaming-ssr/pages')),
      },
      nextConfig: require(join(__dirname, 'streaming-ssr/next.config.js')),
      dependencies: react18Deps,
      installCommand: 'npm install',
    })
  })
  afterAll(() => next.destroy())

  it('should render styled-jsx styles in streaming', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('color:blue')
  })

  it('should redirect paths without trailing-slash and render when slash is appended', async () => {
    const page = '/hello'
    const redirectRes = await fetchViaHTTP(
      next.url,
      page,
      {},
      { redirect: 'manual' }
    )
    const res = await fetchViaHTTP(next.url, page + '/')
    const html = await res.text()

    expect(redirectRes.status).toBe(308)
    expect(res.status).toBe(200)
    expect(html).toContain('hello nextjs')
    expect(html).toContain('home')
  })

  it('should render multi-byte characters correctly in streaming', async () => {
    const html = await renderViaHTTP(next.url, '/multi-byte')
    expect(html).toContain('マルチバイト'.repeat(28))
  })
})

describe('react 18 streaming SSR and RSC with custom server', () => {
  let next
  let server
  let appPort
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'custom-server/pages')),
        'server.js': new FileRef(join(__dirname, 'custom-server/server.js')),
      },
      nextConfig: require(join(__dirname, 'custom-server/next.config.js')),
      dependencies: react18Deps,
    })
    await next.stop()

    const testServer = join(next.testDir, 'server.js')
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /Listening/,
      {
        ...process.env,
        PORT: appPort,
      },
      undefined,
      {
        cwd: next.testDir,
      }
    )
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
  })
  it('should render rsc correctly under custom server', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('streaming')
  })
})
