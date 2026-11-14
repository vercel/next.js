import { nextTestSetup } from 'e2e-utils'
import execa from 'execa'

// A pre-compiled runtime loads some modules from separate files instead of
// its bundle: the `*.external` modules, whose state all bundles share, and
// everything that those import. The Node.js environment setup, which runs
// before a route, comes from separate files as well. If such a file is a
// module that the runtime contains, every server process loads that module
// twice.
//
// These modules are loaded twice today, listed under the file that imports
// them. Remove a module from its list when that import is fixed.
const KNOWN_DUPLICATES: Record<string, string[]> = {
  'next/dist/server/app-render/action-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/after-task-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/cache-signal.js': [
    'next/dist/shared/lib/invariant-error.js',
  ],
  'next/dist/server/app-render/console-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/dynamic-access-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/dynamic-rendering.js': [
    'next/dist/client/components/hooks-server-context.js',
    'next/dist/client/components/static-generation-bailout.js',
    'next/dist/lib/scheduler.js',
  ],
  'next/dist/server/app-render/module-loading/track-module-loading.instance.js':
    ['next/dist/server/app-render/cache-signal.js'],
  'next/dist/server/app-render/staged-rendering.js': [
    'next/dist/shared/lib/invariant-error.js',
    'next/dist/shared/lib/promise-with-resolvers.js',
  ],
  'next/dist/server/app-render/work-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/work-unit-async-storage-instance.js': [
    'next/dist/server/app-render/async-local-storage.js',
  ],
  'next/dist/server/app-render/work-unit-async-storage.external.js': [
    'next/dist/shared/lib/invariant-error.js',
  ],
  'next/dist/server/dynamic-rendering-utils.js': [
    'next/dist/server/app-render/segment-config/ensure-static.js',
    'next/dist/server/app-render/staged-rendering.js',
    'next/dist/shared/lib/invariant-error.js',
    'next/dist/shared/lib/promise-with-resolvers.js',
  ],
  'next/dist/server/lib/app-dir-module.js': ['next/dist/shared/lib/segment.js'],
  'next/dist/server/lib/incremental-cache/memory-cache.external.js': [
    'next/dist/server/lib/lru-cache.js',
    'next/dist/server/response-cache/types.js',
  ],
  'next/dist/server/lib/router-utils/instrumentation-globals.external.js': [
    'next/dist/lib/constants.js',
    'next/dist/server/lib/trace/constants.js',
  ],
  'next/dist/server/lib/router-utils/instrumentation-node-extensions.js': [
    'next/dist/shared/lib/invariant-error.js',
  ],
  'next/dist/server/lib/source-maps.js': ['next/dist/server/lib/lru-cache.js'],
  'next/dist/server/lib/trace/tracer.js': [
    'next/dist/server/lib/trace/constants.js',
    'next/dist/shared/lib/is-thenable.js',
  ],
  'next/dist/server/node-environment-extensions/console-dim.external.js': [
    'next/dist/lib/picocolors.js',
  ],
  'next/dist/server/node-environment-extensions/fast-set-immediate.external.js':
    [
      'next/dist/server/app-render/async-local-storage.js',
      'next/dist/shared/lib/invariant-error.js',
    ],
  'next/dist/server/node-environment-extensions/io-utils.js': [
    'next/dist/server/app-render/dynamic-rendering.js',
    'next/dist/server/app-render/staged-rendering.js',
    'next/dist/server/dynamic-rendering-utils.js',
    'next/dist/shared/lib/invariant-error.js',
  ],
  'next/dist/server/patch-error-inspect.js': ['next/dist/lib/picocolors.js'],
  'next/dist/shared/lib/router/utils/parse-loader-tree.js': [
    'next/dist/shared/lib/segment.js',
  ],
}

// Loaded twice with webpack and Rspack only, which keep this import of
// build/templates/app-route external.
const KNOWN_DUPLICATES_WEBPACK: Record<string, string[]> = {
  '.next/server/app/api/ping/route.js': [
    'next/dist/shared/lib/router/utils/app-paths.js',
  ],
  'next/dist/shared/lib/router/utils/app-paths.js': [
    'next/dist/shared/lib/page-path/ensure-leading-slash.js',
    'next/dist/shared/lib/segment.js',
  ],
}

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
      environment: string[]
      loaded: string[]
      loadedTwice: Record<string, string[]>
    } = JSON.parse(stdout.trim().split('\n').pop()!)

    expect({ status: result.status, body: result.body }).toEqual({
      status: 200,
      body: 'pong',
    })

    // If the runtime or the modules that it contains are not found anymore,
    // the checks below would pass for the wrong reason.
    expect(result.runtimes).toEqual([
      expect.stringMatching(
        /^next\/dist\/compiled\/next-server\/app-route.*\.runtime\.prod\.js$/
      ),
    ])
    expect(result.bundled).toContain(
      'next/dist/server/route-modules/app-route/module.js'
    )

    const knownDuplicates: Record<string, string[] | undefined> = isTurbopack
      ? KNOWN_DUPLICATES
      : { ...KNOWN_DUPLICATES, ...KNOWN_DUPLICATES_WEBPACK }

    // A loaded file imports these modules from separate files although the
    // runtime contains them.
    expect(
      Object.entries(result.loadedTwice).flatMap(([file, ids]) =>
        ids
          .filter((id) => !knownDuplicates[file]?.includes(id))
          .map(
            (id) =>
              `${id} is loaded twice: from the runtime bundle, and as a separate file imported by ${file}. Change that import, or add the module to KNOWN_DUPLICATES under ${file}`
          )
      )
    ).toEqual([])

    // A module that stays listed after its import is fixed could regress
    // unnoticed. This covers the files that the route loads. A file of the
    // environment setup can keep a longer list, and so can a file that is not
    // loaded: a setup that loads less must not fail here.
    expect(
      Object.entries(knownDuplicates).flatMap(([file, ids = []]) =>
        result.loaded.includes(file) && !result.environment.includes(file)
          ? ids
              .filter((id) => !result.loadedTwice[file]?.includes(id))
              .map(
                (id) =>
                  `${file} no longer loads ${id} a second time, remove it from the list of that file`
              )
          : []
      )
    ).toEqual([])

    // The cache controls themselves stay in a module that all bundles share.
    expect(result.loaded).toContain(
      'next/dist/server/lib/incremental-cache/shared-cache-controls-map.external.js'
    )
  })
})
