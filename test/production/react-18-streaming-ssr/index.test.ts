import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

describe('react 18 streaming SSR in minimal mode', () => {
  let next: NextInstance

  beforeAll(async () => {
    process.env.NEXT_PRIVATE_MINIMAL_MODE = '1'

    next = await createNext({
      files: {
        'pages/index.server.js': `
          export default function Page() {
            return <p>static streaming</p>
          }
        `,
      },
      nextConfig: {
        experimental: {
          reactRoot: true,
          serverComponents: true,
          runtime: 'nodejs',
        },
      },
      dependencies: {
        react: '18.0.0',
        'react-dom': '18.0.0',
      },
    })
  })
  afterAll(() => {
    delete process.env.NEXT_PRIVATE_MINIMAL_MODE
    next.destroy()
  })

  it('should generate html response by streaming correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('static streaming')
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
        'pages/index.js': `
          export default function Page() {
            return (
              <div>
                <style jsx>{\`p { color: blue } \`}</style>
                <p>index</p>
              </div>
            )
          }
        `,
        'pages/hello.js': `
          import Link from 'next/link'

          export default function Page() {
            return (
              <div>
                <p>hello nextjs</p>
                <Link href='/'><a>home></a></Link>
              </div>
            )
          }
        `,
        'pages/multi-byte.js': `
          export default function Page() {
            return (
              <div>
                <p>{"マルチバイト".repeat(28)}</p>
              </div>
            );
          }
        `,
      },
      nextConfig: {
        trailingSlash: true,
        experimental: {
          reactRoot: true,
          runtime: 'edge',
        },
      },
      dependencies: {
        react: '18.0.0',
        'react-dom': '18.0.0',
      },
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
