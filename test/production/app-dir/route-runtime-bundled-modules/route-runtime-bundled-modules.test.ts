import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// A pre-compiled runtime loads some modules from separate files instead of
// its bundle: the `*.external` modules, whose state all bundles share, and
// everything that those import. If such a file is a module that the runtime
// contains as well, every server process loads that module twice.
//
// The check covers what a route loads after the Node.js environment setup,
// which always comes from separate files.
//
// These modules are loaded twice today, grouped by the module that imports
// them. Remove a module from its list when that is fixed.
const KNOWN_DUPLICATES = [
  // server/lib/trace/tracer
  'next/dist/server/lib/trace/constants.js',
  'next/dist/shared/lib/is-thenable.js',
  // server/lib/router-utils/instrumentation-globals.external
  'next/dist/lib/constants.js',
  // server/lib/incremental-cache/memory-cache.external
  'next/dist/server/response-cache/types.js',
  // server/app-render/module-loading/track-module-loading.instance
  'next/dist/server/app-render/cache-signal.js',
]

// Loaded twice with webpack and Rspack only, which keep this import of
// build/templates/app-route external.
const KNOWN_DUPLICATES_WEBPACK = [
  'next/dist/shared/lib/page-path/ensure-leading-slash.js',
  'next/dist/shared/lib/router/utils/app-paths.js',
]

describe('route-runtime-bundled-modules', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should not load modules of the route runtime a second time from separate files', async () => {
    await next.build()

    const { stdout } = await execa(process.execPath, ['invoke-route.js'], {
      cwd: next.testDir,
      // The error of a failed process does not contain what it printed.
      stderr: 'inherit',
    })
    const result: {
      status: number
      body: string
      runtimes: string[]
      bundled: string[]
      loaded: string[]
      loadedTwice: string[]
      importers: Record<string, string[]>
    } = JSON.parse(stdout.trim().split('\n').pop()!)

    expect({ status: result.status, body: result.body }).toEqual({
      status: 200,
      body: 'pong',
    })

    // If the runtime or the modules that it contains are not found anymore,
    // the check below would pass for the wrong reason.
    expect(result.runtimes).toEqual([
      expect.stringMatching(
        /^next\/dist\/compiled\/next-server\/app-route.*\.runtime\.prod\.js$/
      ),
    ])
    expect(result.bundled).toContain(
      'next/dist/server/route-modules/app-route/module.js'
    )

    const knownDuplicates = isTurbopack
      ? KNOWN_DUPLICATES
      : [...KNOWN_DUPLICATES, ...KNOWN_DUPLICATES_WEBPACK]

    // The route loaded these modules from separate files although its runtime
    // contains them.
    expect(
      result.loadedTwice
        .filter((id) => !knownDuplicates.includes(id))
        .map(
          (id) =>
            `${id} is loaded twice: from the runtime bundle, and as a separate file imported by ${result.importers[id].join(' and ')}. Change that import, or add the module to KNOWN_DUPLICATES under the module that imports it`
        )
    ).toEqual([])

    // A module that stays listed after it is fixed could regress unnoticed.
    expect(
      knownDuplicates
        .filter((id) => !result.loadedTwice.includes(id))
        .map((id) => `${id} is no longer loaded twice, remove it from its list`)
    ).toEqual([])

    // The cache controls themselves stay in a module that all bundles share.
    expect(result.loaded).toContain(
      'next/dist/server/lib/incremental-cache/shared-cache-controls-map.external.js'
    )
  })
})
