import { nextTestSetup } from 'e2e-utils'
import { gate, retry, shouldUseTurbopack } from 'next-test-utils'

function watchpackCalls(output: string) {
  const prefix = '[route-discovery-watch]'
  const calls: Array<{ files: string[]; directories: string[] }> = output
    .split('\n')
    .filter((line) => line.includes(prefix))
    .map((line) => JSON.parse(line.slice(line.indexOf(prefix) + prefix.length)))
  return calls
}

describe('native route discovery', () => {
  // Watchpack polls every 5007ms when WATCHPACK_POLLING=true. Allow multiple
  // observation cycles when a directory change also requires compilation.
  const routeUpdateTimeout = 15_000
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    env: {
      NODE_OPTIONS: '--require ./observe-watchpack.cjs',
      TEST_NATIVE_ROUTE_DISCOVERY_TURBOPACK: shouldUseTurbopack() ? '1' : '0',
    },
  })

  async function routeDirectoryWatches() {
    const calls = watchpackCalls(next.cliOutput)

    expect(calls.length).toBeGreaterThan(0)
    // Prove that the probe observed Next's watcher even when no directory is
    // watched. Native discovery retains an explicit-file config/env watcher.
    if (await gate((conditions) => conditions.turbopack)) {
      expect(calls.some((call) => call.files.includes('.env'))).toBe(true)
    }
    return calls
      .flatMap((call) => call.directories)
      .filter((directory) => {
        return (
          directory === '.' ||
          /^(?:src\/)?(?:app|pages)(?:\/|$)/.test(directory)
        )
      })
  }

  async function expectPage(pathname: string, text: string) {
    await retry(async () => {
      const response = await next.fetch(pathname, {
        signal: AbortSignal.timeout(10_000),
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(text)
    }, routeUpdateTimeout)
  }

  async function expectMissing(pathname: string) {
    await retry(async () => {
      expect(
        (await next.fetch(pathname, { signal: AbortSignal.timeout(10_000) }))
          .status
      ).toBe(404)
    }, routeUpdateTimeout)
  }

  async function hasPage(pathname: string) {
    const response = await next.fetch(
      `/__test_has_page?${new URLSearchParams({ pathname })}`
    )
    expect(response.status).toBe(200)
    return response.json()
  }

  it('uses native route observation while retaining explicit config file watches', async () => {
    await expectPage('/', 'hello world')

    if (await gate((conditions) => conditions.turbopack)) {
      expect(await routeDirectoryWatches()).toEqual([])
    } else {
      expect((await routeDirectoryWatches()).length).toBeGreaterThan(0)
    }
  })

  it('uses the effective inventory for grouped App pages and keeps hasPage semantics', async () => {
    await expectPage('/from-group', 'Grouped page')

    expect(await hasPage('/from-group')).toBe(
      await gate((conditions) => conditions.turbopack)
    )
    expect(await hasPage('/pages-route')).toBe(true)
    expect(await hasPage('/api/pages-handler')).toBe(true)
    expect(await hasPage('/api/app-handler')).toBe(false)
    expect(await hasPage('/missing')).toBe(false)
    expect(await hasPage('/../invalid')).toBe(false)
    expect(await hasPage('/_app')).toBe(false)

    const pageApi = await next.fetch('/api/pages-handler')
    expect(pageApi.status).toBe(200)
    expect(await pageApi.json()).toEqual({ message: 'Pages API' })
    const appApi = await next.fetch('/api/app-handler')
    expect(appApi.status).toBe(200)
    expect(await appApi.json()).toEqual({ message: 'App route handler' })
  })

  it('serves static metadata and follows metadata URLs when exports change', async () => {
    const icon = await next.fetch('/icon.svg')
    expect(icon.status).toBe(200)
    expect(await icon.text()).toContain('Native discovery icon')

    await expectPage('/sitemap.xml', 'https://example.com/native-discovery')
    try {
      await next.patchFile(
        'app/sitemap.ts',
        `export function generateSitemaps() { return [{ id: 0 }] }
         export default function sitemap() {
           return [{ url: 'https://example.com/native-discovery-multiple' }]
         }`
      )
      await expectPage(
        '/sitemap/0.xml',
        'https://example.com/native-discovery-multiple'
      )
      await expectMissing('/sitemap.xml')
    } finally {
      await next.patchFile(
        'app/sitemap.ts',
        `export default function sitemap() {
           return [{ url: 'https://example.com/native-discovery' }]
         }`
      )
    }
  })

  it('keeps other routes working while a dynamic metadata file does not parse', async () => {
    await expectPage('/', 'hello world')
    try {
      // Discovery parses the sitemap to name its route. Serving the page added
      // after it shows that discovery has processed both files. Requesting the
      // sitemap itself would make every page without errors of its own show
      // that route's error, so this test never does.
      await next.patchFile(
        'app/broken-metadata/sitemap.ts',
        'export default function sitemap( {\n'
      )
      await next.patchFile(
        'app/broken-metadata/page.tsx',
        'export default function Page() { return <p>Next to a broken sitemap</p> }'
      )
      await expectPage('/broken-metadata', 'Next to a broken sitemap')
      await expectPage('/', 'hello world')
      await expectPage('/pages-route', 'Pages route')
    } finally {
      await next.deleteFile('app/broken-metadata')
    }
  })

  it('updates proxy presence and matchers without the route watcher', async () => {
    const proxy = (matcher: string) => `
      import { NextResponse } from 'next/server'
      export function proxy() {
        return NextResponse.next({ headers: { 'x-native-discovery-proxy': 'active' } })
      }
      export const config = { matcher: ${JSON.stringify(matcher)} }
    `
    try {
      await next.patchFile('proxy.ts', proxy('/pages-route'))
      await retry(async () => {
        expect(
          (await next.fetch('/pages-route')).headers.get(
            'x-native-discovery-proxy'
          )
        ).toBe('active')
      }, routeUpdateTimeout)
      expect(
        (await next.fetch('/')).headers.get('x-native-discovery-proxy')
      ).toBeNull()

      await next.patchFile('proxy.ts', proxy('/'))
      await retry(async () => {
        expect(
          (await next.fetch('/')).headers.get('x-native-discovery-proxy')
        ).toBe('active')
      }, routeUpdateTimeout)
      expect(
        (await next.fetch('/pages-route')).headers.get(
          'x-native-discovery-proxy'
        )
      ).toBeNull()
    } finally {
      await next.deleteFile('proxy.ts')
    }
    await retry(async () => {
      expect(
        (await next.fetch('/')).headers.get('x-native-discovery-proxy')
      ).toBeNull()
    }, routeUpdateTimeout)
  })

  it('keeps running and recovers after conflicting dynamic routes are fixed', async () => {
    try {
      await next.patchFile(
        'pages/dynamic-conflict/[id].tsx',
        'export default function Page() { return <p>Original dynamic page</p> }'
      )
      await expectPage('/dynamic-conflict/first', 'Original dynamic page')

      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/dynamic-conflict/[slug].tsx',
        'export default function Page() { return <p>Conflicting dynamic page</p> }'
      )
      await retry(async () => {
        const output = next.cliOutput.slice(outputIndex)
        expect(output).toContain('Failed to reload dynamic routes')
        expect(output).toContain(
          'You cannot use different slug names for the same dynamic path'
        )
      }, routeUpdateTimeout)

      // A successful request after the diagnostic proves the server survived.
      await expectPage('/', 'hello world')
      await expectPage('/dynamic-conflict/first', 'Original dynamic page')

      await next.deleteFile('pages/dynamic-conflict/[slug].tsx')
      // Change the compiler key to verify that discovery consumes later updates.
      await next.renameFile(
        'pages/dynamic-conflict/[id].tsx',
        'pages/dynamic-conflict/[recovered].tsx'
      )
      await next.patchFile(
        'pages/dynamic-conflict/[recovered].tsx',
        'export default function Page() { return <p>Recovered dynamic page</p> }'
      )
      await expectPage('/dynamic-conflict/after', 'Recovered dynamic page')
    } finally {
      await next.deleteFile('pages/dynamic-conflict')
    }
  })

  it('discovers added, renamed, moved, and removed routes without a Next route scan', async () => {
    try {
      await next.patchFile(
        'app/(moving)/created/page.tsx',
        'export default function Page() { return <p>Added App page</p> }'
      )
      await next.patchFile(
        'pages/created-page.tsx',
        'export default function Page() { return <p>Added Pages page</p> }'
      )
      await expectPage('/created', 'Added App page')
      await expectPage('/created-page', 'Added Pages page')

      // The URL stays the same while the structural App page key changes.
      await next.renameFolder('app/(moving)', 'app/(renamed-group)')
      await next.patchFile(
        'app/(renamed-group)/created/page.tsx',
        'export default function Page() { return <p>Moved App page</p> }'
      )
      await expectPage('/created', 'Moved App page')

      await next.renameFolder(
        'app/(renamed-group)/created',
        'app/(renamed-group)/renamed'
      )
      await next.renameFile('pages/created-page.tsx', 'pages/renamed-page.tsx')
      await expectPage('/renamed', 'Moved App page')
      await expectPage('/renamed-page', 'Added Pages page')
      await expectMissing('/created')
      await expectMissing('/created-page')

      await next.deleteFile('app/(renamed-group)')
      await next.deleteFile('pages/renamed-page.tsx')
      await expectMissing('/renamed')
      await expectMissing('/renamed-page')

      if (await gate((conditions) => conditions.turbopack)) {
        expect(await routeDirectoryWatches()).toEqual([])
      } else {
        expect((await routeDirectoryWatches()).length).toBeGreaterThan(0)
      }
    } finally {
      await next.deleteFile('app/(moving)')
      await next.deleteFile('app/(renamed-group)')
      await next.deleteFile('pages/created-page.tsx')
      await next.deleteFile('pages/renamed-page.tsx')
    }
  })
})

describe('native route discovery with legacy exportPathMap', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    startCommand: 'node server.js',
    serverReadyPattern: /- Local:/,
    env: {
      NODE_OPTIONS: '--require ./observe-watchpack.cjs',
      TEST_NATIVE_ROUTE_DISCOVERY_TURBOPACK: shouldUseTurbopack() ? '1' : '0',
    },
  })

  beforeAll(async () => {
    await next.patchFile('app/_export-map/pathname.txt', '/legacy-first')
    await next.patchFile(
      'next.config.ts',
      `import { readFileSync } from 'node:fs'
       import { join } from 'node:path'
       import type { NextConfig } from 'next'

       const config: NextConfig = {
         exportPathMap(_defaultMap, { dir }) {
           const pathname = readFileSync(
             join(dir, 'app/_export-map/pathname.txt'), 'utf8'
           ).trim()
           return { [pathname]: { page: '/pages-route' } }
         },
       }
       export default config`
    )
    await next.start()
  })

  it('refreshes mappings after an in-place edit to an unimported helper', async () => {
    const initial = await next.fetch('/legacy-first')
    expect(initial.status).toBe(200)
    expect(await initial.text()).toContain('Pages route')
    expect(
      watchpackCalls(next.cliOutput).some((call) =>
        call.directories.includes('.')
      )
    ).toBe(true)

    // This helper was created by the test, so it has no shared hard link.
    // Modify its existing inode: replacing it would also invalidate the native
    // directory inventory and could hide a missing legacy callback watcher.
    await next.writeFileBuffer(
      'app/_export-map/pathname.txt',
      Buffer.from('/legacy-after')
    )
    await retry(async () => {
      const updated = await next.fetch('/legacy-after', {
        signal: AbortSignal.timeout(10_000),
      })
      expect(updated.status).toBe(200)
      expect(await updated.text()).toContain('Pages route')
      expect((await next.fetch('/legacy-first')).status).toBe(404)
    }, 15_000)
  })
})

describe('native route discovery with failing or slow publication callbacks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  beforeAll(async () => {
    // Route type generation calls rewrites(), and each route publication calls
    // exportPathMap. Both are user code that can start failing or stalling
    // after startup, like a rewrites() that loads its rules from a CMS.
    await next.patchFile(
      'next.config.ts',
      `import { existsSync, readFileSync } from 'node:fs'
       import { join } from 'node:path'
       import type { NextConfig } from 'next'

       function fails(callback: string) {
         const file = join(process.cwd(), 'failing-callback.txt')
         return existsSync(file) && readFileSync(file, 'utf8') === callback
       }

       const config: NextConfig = {
         async rewrites() {
           if (fails('rewrites')) {
             throw new Error('rewrites source unavailable (simulated)')
           }
           const blocker = join(process.cwd(), 'blocking-rewrites.txt')
           if (existsSync(blocker)) {
             console.log('[publication-test] rewrites() is waiting')
             while (existsSync(blocker)) {
               await new Promise((resolve) => setTimeout(resolve, 100))
             }
           }
           return []
         },
         exportPathMap(defaultMap) {
           if (fails('exportPathMap')) {
             throw new Error('exportPathMap source unavailable (simulated)')
           }
           return defaultMap
         },
       }
       export default config`
    )
    await next.start()
  })

  async function expectPage(pathname: string, text: string) {
    await retry(async () => {
      const response = await next.fetch(pathname, {
        signal: AbortSignal.timeout(10_000),
      })
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(text)
    }, 15_000)
  }

  it.each([
    [
      'rewrites',
      'app/after-rewrites-failure/page.tsx',
      '/after-rewrites-failure',
    ],
    [
      'exportPathMap',
      'pages/after-export-path-map-failure.tsx',
      '/after-export-path-map-failure',
    ],
  ])(
    'logs a failing %s and keeps serving routes',
    async (callback, file, pathname) => {
      // Serving a page first ensures the startup publication has finished.
      await expectPage('/', 'hello world')
      const outputIndex = next.cliOutput.length
      try {
        await next.patchFile('failing-callback.txt', callback)
        await next.patchFile(
          file,
          `export default function Page() { return <p>Added after ${callback} failed</p> }`
        )
        await retry(async () => {
          expect(next.cliOutput.slice(outputIndex)).toContain(
            `${callback} source unavailable (simulated)`
          )
        }, 15_000)

        // A successful request after the failure proves the server survived.
        await expectPage(pathname, `Added after ${callback} failed`)
      } finally {
        await next.deleteFile('failing-callback.txt')
        await next.deleteFile(file)
      }
    }
  )

  it('serves a new route while rewrites() is still running for its route types', async () => {
    await expectPage('/', 'hello world')
    const outputIndex = next.cliOutput.length
    try {
      await next.patchFile('blocking-rewrites.txt', '')
      await next.patchFile(
        'app/during-slow-rewrites/page.tsx',
        'export default function Page() { return <p>Served while rewrites() waits</p> }'
      )
      await retry(async () => {
        expect(next.cliOutput.slice(outputIndex)).toContain(
          '[publication-test] rewrites() is waiting'
        )
      }, 15_000)

      // Route types for this update are blocked. Requests must not be.
      await expectPage('/during-slow-rewrites', 'Served while rewrites() waits')
      await expectPage('/', 'hello world')
    } finally {
      await next.deleteFile('blocking-rewrites.txt')
      await next.deleteFile('app/during-slow-rewrites')
    }
  })
})
