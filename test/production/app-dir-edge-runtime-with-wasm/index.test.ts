import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

const files = {
  'app/layout.jsx': `
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
  'app/page.jsx': `
    import wasm from '../wasm/add.wasm?module'
    const instance$ = WebAssembly.instantiate(wasm);

    async function addOne(a) {
      const { exports } = await instance$;
      return exports.add_one(a);
    }

    export default async function Page() {
      const two = await addOne(1)
      return \`1 + 1 is: $\{two}\`
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
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have built', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('1 + 1 is: 2')
  })
})
