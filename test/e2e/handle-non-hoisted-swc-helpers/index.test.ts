import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('handle-non-hoisted-swc-helpers', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return <p>hello world</p>
          }

          export function getServerSideProps() {
            const helper = require('@swc/helpers/_/_object_spread.js')
            console.log(helper)
            return {
              props: {
                now: Date.now()
              }
            }
          }
        `,
      },
      installCommand:
        'npm install; mkdir -p node_modules/next/node_modules/@swc; mv node_modules/@swc/helpers node_modules/next/node_modules/@swc/',
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
