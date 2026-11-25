import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// Each case is rendered as `#<id>` by a dedicated loader (see next.config.js) and initially shows
// `v1`. Editing `file` (replacing `from` with its `v2` version, or creating it when `from` is
// `null`) must make the loader re-run with the new code or data.
type Case = { id: string; file: string; from: string | null }

const cases = {
  loaderFile: { id: 'c01', file: 'loaders/c01.js', from: "'v1'" },
  absoluteLoaderFile: { id: 'c16', file: 'loaders/c16.js', from: "'v1'" },
  cjsRequire: { id: 'c02', file: 'loaders/c02-dep.js', from: "'v1'" },
  nestedCjsRequire: { id: 'c03', file: 'loaders/c03-b.js', from: "'v1'" },
  jsonRequire: { id: 'c04', file: 'loaders/c04-data.json', from: '"v1"' },
  esmImport: { id: 'c05', file: 'loaders/c05-dep.mjs', from: "'v1'" },
  computedRequire: { id: 'c06', file: 'loaders/dyn/c06-dep.js', from: "'v1'" },
  addDependency: { id: 'c08', file: 'loaders/c08-data.txt', from: 'v1' },
  dynamicImport: { id: 'c09', file: 'loaders/c09-dep.mjs', from: "'v1'" },
  packageLoaderDependency: {
    id: 'c10',
    file: 'node_modules/pkg-loader-dep/index.js',
    from: "'v1'",
  },
  newFileChangesResolution: {
    id: 'c12',
    file: 'loaders/c12-res.js',
    from: null,
  },
  resourceDirLoader: {
    id: 'c11',
    file: 'app/resdir/node_modules/resdir-loader/index.js',
    from: "'v1'",
  },
  conditionalExportsLoader: {
    id: 'c13',
    file: 'node_modules/cond-loader/main.js',
    from: "'v1'",
  },
  moduleScopeAddDependency: {
    id: 'c14',
    file: 'loaders/c14-data.txt',
    from: 'v1',
  },
} satisfies Record<string, Case>

const workingCases: Array<[string, Case]> = [
  ['the loader file', cases.loaderFile],
  ['the loader file (absolute loader path)', cases.absoluteLoaderFile],
  ['a CommonJS module required by the loader', cases.cjsRequire],
  ['a transitively required CommonJS module', cases.nestedCjsRequire],
  ['a JSON file required by the loader', cases.jsonRequire],
  ['a module statically imported by an ES module', cases.esmImport],
  ['a module required with a computed path', cases.computedRequire],
  ['a file reported with addDependency', cases.addDependency],
  ['a module loaded with import()', cases.dynamicImport],
  [
    'a dependency of a loader package in node_modules',
    cases.packageLoaderDependency,
  ],
  [
    'a new file that changes how a require resolves',
    cases.newFileChangesResolution,
  ],
]

// @force-gate turbopack
describe('turbopack-loader-invalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      // Keep the filesystem cache enabled with locally built native bindings.
      TURBO_ENGINE_IGNORE_DIRTY: '1',
      // Persist snapshots quickly so restarts restore from the cache.
      TURBO_ENGINE_SNAPSHOT_IDLE_TIMEOUT_MILLIS: '1000',
      TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
    },
  })

  async function value(id: string) {
    const $ = await next.render$('/')
    return $(`#${id}`).text()
  }

  async function changedContent({ file, from }: Case) {
    return from === null
      ? "module.exports = { value: 'v2' }\n"
      : (await next.readFile(file)).replace(from, from.replace('v1', 'v2'))
  }

  async function stop() {
    // Give the filesystem cache time to persist before stopping.
    await waitFor(3000)
    await next.stop()
  }

  async function expectChangeWhileRunning(c: Case) {
    expect(await value(c.id)).toBe('v1')

    await next.patchFile(c.file, await changedContent(c), async () => {
      await retry(async () => {
        expect(await value(c.id)).toBe('v2')
      }, 15_000)
    })

    await retry(async () => {
      expect(await value(c.id)).toBe('v1')
    }, 15_000)
  }

  async function expectChangeWhileStopped(c: Case) {
    expect(await value(c.id)).toBe('v1')

    const original = c.from === null ? null : await next.readFile(c.file)
    const content = await changedContent(c)

    await stop()
    await next.patchFile(c.file, content)
    await next.start()
    try {
      expect(await value(c.id)).toBe('v2')
    } finally {
      await stop()
      if (original === null) {
        await next.deleteFile(c.file)
      } else {
        await next.patchFile(c.file, original)
      }
      await next.start()
    }
    expect(await value(c.id)).toBe('v1')
  }

  describe('while running', () => {
    it.each(workingCases)('re-runs the loader when changing %s', (_, c) =>
      expectChangeWhileRunning(c)
    )

    // TODO: loaders that only resolve from the resource's directory aren't tracked.
    // @gate FIXME
    it('re-runs the loader when changing a loader only resolvable from the resource directory', () =>
      expectChangeWhileRunning(cases.resourceDirLoader))

    // TODO: loader packages with conditional `exports` aren't tracked.
    // @gate FIXME
    it('re-runs the loader when changing a loader package with conditional exports', () =>
      expectChangeWhileRunning(cases.conditionalExportsLoader))

    // Not covered while running: a file read at module load and reported with `addDependency`.
    // The reported dependency invalidates the evaluation, but the result appears to depend on
    // whether a pooled worker that already loaded the loader module serves it, so a gate would
    // be flaky.
  })

  describe('while stopped', () => {
    it.each([
      ...workingCases,
      [
        'a file read at module load and reported with addDependency',
        cases.moduleScopeAddDependency,
      ] as [string, Case],
    ])('re-runs the loader after restart when changing %s', (_, c) =>
      expectChangeWhileStopped(c)
    )

    // TODO: loaders that only resolve from the resource's directory aren't tracked.
    // @gate FIXME
    it('re-runs the loader after restart when changing a loader only resolvable from the resource directory', () =>
      expectChangeWhileStopped(cases.resourceDirLoader))

    // TODO: loader packages with conditional `exports` aren't tracked.
    // @gate FIXME
    it('re-runs the loader after restart when changing a loader package with conditional exports', () =>
      expectChangeWhileStopped(cases.conditionalExportsLoader))
  })
})
