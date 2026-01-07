import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'
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
    const middlewareManifest = await next.readJSON(
      '.next/server/middleware-manifest.json'
    )

    const files = middlewareManifest.middleware['/'].files

    let allContentCombined = ''
    for (const file of files) {
      const content = await next.readFile(path.join('.next', file))
      allContentCombined += content
    }

    expect(allContentCombined).toContain('EdgeRuntime is defined')
    expect(allContentCombined).not.toContain('EdgeRuntime is undefined')
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
