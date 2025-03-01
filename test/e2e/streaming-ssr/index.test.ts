import { join } from 'path'
import { createNext, nextTestSetup } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import {
  check,
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

const isNextProd = !(global as any).isNextDev && !(global as any).isNextDeploy

describe('streaming SSR with custom next configs', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'streaming-ssr'),
  })

  it('should match more specific route along with dynamic routes', async () => {
    const res1 = await fetchViaHTTP(next.url, '/api/user/login')
    const res2 = await fetchViaHTTP(next.url, '/api/user/any')
    expect(await res1.text()).toBe('login')
    expect(await res2.text()).toBe('[id]')
  })

  it('should render styled-jsx styles in streaming', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toMatch(/color:(?:blue|#00f)/)
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

  it('should render next/router correctly in edge runtime', async () => {
    const html = await renderViaHTTP(next.url, '/router')
    expect(html).toContain('link')
  })

  it('should render multi-byte characters correctly in streaming', async () => {
    const html = await renderViaHTTP(next.url, '/multi-byte')
    expect(html).toContain('マルチバイト'.repeat(28))
  })

  if ((global as any).isNextDev) {
    it('should work with custom document', async () => {
      await next.patchFile(
        'pages/_document.js',
        `
      import { Html, Head, Main, NextScript } from 'next/document'

      export default function Document() {
        return (
          <Html>
            <Head />
            <body>
              <Main />
              <NextScript />
            </body>
          </Html>
        )
      }
    `
      )
      await check(async () => {
        return await renderViaHTTP(next.url, '/')
      }, /index/)
      await next.deleteFile('pages/_document.js')
    })
  }
})

if (isNextProd) {
  describe('streaming SSR with custom server', () => {
    let next
    let server
    let appPort
    beforeAll(async () => {
      next = await createNext({
        files: join(__dirname, 'custom-server'),
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
    it('should render page correctly under custom server', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toContain('streaming')
    })
  })

  describe('react 18 streaming SSR in minimal mode with node runtime', () => {
    let next: NextInstance

    beforeAll(async () => {
      if (isNextProd) {
        process.env.NEXT_PRIVATE_MINIMAL_MODE = '1'
      }

      next = await createNext({
        files: {
          'pages/index.js': `
          export default function Page() {
            return <p>streaming</p>
          }
          export async function getServerSideProps() {
            return { props: {} }
          }`,
        },
        nextConfig: {
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
      })
    })
    afterAll(() => {
      if (isNextProd) {
        delete process.env.NEXT_PRIVATE_MINIMAL_MODE
      }
      next.destroy()
    })

    // Relies on the custom webpack config above
    ;(process.env.TURBOPACK ? it.skip : it)(
      'should pass correct nextRuntime values',
      async () => {
        const content = await next.readFile('runtimes.txt')
        // eslint-disable-next-line jest/no-standalone-expect
        expect(content.split('\n').sort()).toEqual(['client', 'edge', 'nodejs'])
      }
    )

    it('should generate html response by streaming correctly', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toContain('streaming')
    })

    if (isNextProd) {
      it('should have generated a static 404 page', async () => {
        expect(await next.readFile('.next/server/pages/404.html')).toBeTruthy()

        const res = await fetchViaHTTP(next.url, '/non-existent')
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('This page could not be found')
      })
    }
  })
}
