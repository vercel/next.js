import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// The pre-compiled server and the route runtimes bundle these modules. The
// `*.external` modules stay outside of the bundles so that all bundles share
// one instance, and everything they import is loaded from separate files. If
// one of them imports a module below, every server process loads it twice.
const BUNDLED_MODULES = [
  'next/dist/server/lib/route-cache-key.js',
  'next/dist/server/normalizers/built/app/app-pathname-normalizer.js',
  'next/dist/shared/lib/i18n/normalize-locale-path.js',
  'next/dist/shared/lib/page-path/normalize-page-path.js',
  'next/dist/shared/lib/router/utils/sorted-routes.js',
]

describe('minimal-server-bundled-modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should not load bundled modules a second time as separate files', async () => {
    await next.build()

    const { stdout } = await execa(process.execPath, ['minimal-server.js'], {
      cwd: next.testDir,
    })
    const result: { status: number; body: string; loaded: string[] } =
      JSON.parse(stdout.trim().split('\n').pop()!)

    expect({ status: result.status, body: result.body }).toEqual({
      status: 200,
      body: 'pong',
    })

    // If the list of loaded files is not reported anymore, the check below
    // would pass for the wrong reason.
    expect(result.loaded).toContain(
      'next/dist/compiled/next-server/server.runtime.prod.js'
    )

    expect(result.loaded.filter((id) => BUNDLED_MODULES.includes(id))).toEqual(
      []
    )

    // The cache controls themselves stay in a module that all bundles share.
    expect(result.loaded).toContain(
      'next/dist/server/lib/incremental-cache/shared-cache-controls-map.external.js'
    )
  })
})
