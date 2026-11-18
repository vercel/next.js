import { nextTestSetup } from 'e2e-utils'

describe('Pages Router request methods', () => {
  const { next } = nextTestSetup({
    startServerTimeout: 30_000,
    startCommand: 'node node_modules/next/dist/bin/next dev',
    files: {
      'pages/index.js': `
        export default function Page() {
          return <p>hello world</p>
        }
      `,
    },
  })

  it('should respond with 405 for POST to an auto-static page', async () => {
    const res = await next.fetch('/', { method: 'POST' })
    const allow = res.headers.get('allow') || ''

    expect(res.status).toBe(405)
    expect(allow).toContain('GET')
    expect(allow).toContain('HEAD')
    expect(await res.text()).toContain('Method Not Allowed')
  })
})
