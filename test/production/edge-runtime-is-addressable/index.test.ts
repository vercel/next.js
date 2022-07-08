import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

describe('Edge Runtime is addressable', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'middleware.js': `
          import { NextResponse } from 'next/server'

          if (typeof EdgeRuntime === 'undefined') {
            console.log("EdgeRuntime is undefined");
          } else {
            console.log("EdgeRuntime is defined");
          }

          export default (req) => {
            return NextResponse.next({
              headers: {
                'x-runtime-version': EdgeRuntime
              }
            })
          }
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  test('EdgeRuntime evaluates to a string', async () => {
    const resp = await fetchViaHTTP(next.url, '/')
    expect(await resp.text()).toContain('hello world')
    expect(Object.fromEntries(resp.headers)).toMatchObject({
      'x-runtime-version': 'edge-runtime',
    })
  })

  test('removes the undefined branch with dead code elimination', async () => {
    const compiledMiddlewareFile = await fs.readFile(
      path.join(next.testDir, '.next/server/middleware.js'),
      'utf8'
    )

    expect(compiledMiddlewareFile).toContain('EdgeRuntime is defined')
    expect(compiledMiddlewareFile).not.toContain('EdgeRuntime is undefined')
  })
})
