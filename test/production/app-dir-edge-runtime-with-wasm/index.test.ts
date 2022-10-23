import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

const files = {
  'app/layout.tsx': `
    export default function AppLayout({ children }) {
      return (
        <html>
          <head>
            <title>WASM Import</title>
          </head>
          <body>
            {children}
          </body>
        </html>
      )
    }
  `,
  'app/page.tsx': `
    // @ts-expect-error
    import wasm from '../wasm/add.wasm?module'

    console.log(wasm)

    export default function Page() {
      return "index page"
    }

    export const runtime = "experimental-edge"
  `,
  'wasm/add.wasm': new FileRef(path.join(__dirname, 'add.wasm')),
}

describe('app-dir edge runtime with wasm', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files,
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
        typescript: 'latest',
        '@types/react': 'latest',
        '@types/node': 'latest',
      },
      nextConfig: {
        experimental: {
          appDir: true,
        },
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have built', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('index page')
  })
})
