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
        react: '18.0.0-rc.0',
        'react-dom': '18.0.0-rc.0',
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
        'pages/hello.js': `
          export default function Page() { 
            return <p>hello</p>
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
        react: '18.0.0-rc.0',
        'react-dom': '18.0.0-rc.0',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should redirect paths without trailing-slash and render when slash is appended', async () => {
    const page = '/hello'
    const html = await renderViaHTTP(next.url, page + '/')
    const res = await fetchViaHTTP(next.url, page, {}, { redirect: 'manual' })

    expect(html).toContain('hello')
    expect(res.status).toBe(308)
  })
})
