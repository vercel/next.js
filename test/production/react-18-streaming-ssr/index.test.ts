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
        react: '18.0.0-rc.2',
        'react-dom': '18.0.0-rc.2',
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
          export default function Page() {
            return <p>hello nextjs</p>
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
        react: '18.0.0-rc.2',
        'react-dom': '18.0.0-rc.2',
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
  })
})
