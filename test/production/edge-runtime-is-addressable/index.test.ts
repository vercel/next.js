import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import fs from 'fs-extra'
import path from 'path'

const files = {
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
          'x-runtime-version': EdgeRuntime,
          'x-runtime-version-dynamic': getDynamicRuntimeVersion(self)
        }
      })
    }

    function getDynamicRuntimeVersion(from) {
      return from.EdgeRuntime;
    }
  `,
}

describe('Edge Runtime is addressable', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files,
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  test('EdgeRuntime evaluates to a string', async () => {
    const resp = await fetchViaHTTP(next.url, '/')
    expect(await resp.text()).toContain('hello world')
    expect(Object.fromEntries(resp.headers)).toMatchObject({
      'x-runtime-version': 'edge-runtime',
      'x-runtime-version-dynamic': 'edge-runtime',
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

describe('Edge Runtime can be set to the production provider', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files,
      dependencies: {},
      env: {
        NEXT_EDGE_RUNTIME_PROVIDER: 'vercel',
      },
    })
  })
  afterAll(() => next.destroy())

  test('EdgeRuntime evaluates to a string', async () => {
    const resp = await fetchViaHTTP(next.url, '/')
    expect(await resp.text()).toContain('hello world')
    expect(Object.fromEntries(resp.headers)).toMatchObject({
      'x-runtime-version': 'vercel',
      // We don't test for x-runtime-version-dynamic here
      // because the tests are using edge-runtime and not Vercel
      // as the provider.
    })
  })
})
