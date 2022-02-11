import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('react-18-streaming-ssr in minimal mode', () => {
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
      skipStart: true,
    })

    await next.start()
  })
  afterAll(() => next.destroy())

  it('should generate html response by streaming correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('static streaming')
  })
})
