import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { listClientChunks } from 'next-test-utils'

// Normalize a sourcemap `sources` entry to a path relative to the Next.js
// package root (e.g. `src/...`, `dist/...`), so the path filters below behave
// consistently across bundlers and produce stable snapshots. Webpack emits
// `webpack://_N_E/../../src/...`; Turbopack emits
// `turbopack:///[project]/<...>/packages/next/src/...`.
function normalizeSource(source: string): string {
  return source
    .replace(/\?.*$/, '')
    .replace(/^webpack:\/\/_N_E\//, '')
    .replace(/^turbopack:\/\/\//, '')
    .replace(/^\[project\]\//, '')
    .replace(/^(?:\.\.\/)+/, '')
    .replace(/^.*?packages\/next\//, '')
    .replace(/^.*?\/node_modules\/next\//, '')
}

describe('browser-chunks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let sources: string[] = []
  let jsContents: string[] = []
  beforeAll(async () => {
    const chunksDir = join(next.testDir, '.next')

    const chunks = await listClientChunks(chunksDir)

    const sourcemaps = await Promise.all(
      chunks
        .filter((filename) => filename.endsWith('.js.map'))
        .map((f) => readFile(join(chunksDir, f), 'utf8'))
    )
    sources = sourcemaps.flatMap((sourcemap) => JSON.parse(sourcemap).sources)

    jsContents = await Promise.all(
      chunks
        .filter((filename) => filename.endsWith('.js'))
        .map((f) => readFile(join(chunksDir, f), 'utf8'))
    )
  })

  it('must not bundle any server modules into browser chunks', () => {
    const serverSources = Array.from(
      new Set(
        sources
          // normalizing in case we regress and want to keep track of the regression
          .map(normalizeSource)
          .filter(
            (source) =>
              source.startsWith('src/server/') ||
              source.startsWith('dist/esm/server/') ||
              source.startsWith('dist/server/') ||
              source.includes('next-devtools/server')
          )
      )
    ).sort()

    expect(serverSources).toEqual([])
  })

  it('must not bundle any dev overlay into browser chunks', () => {
    const devOverlaySources = Array.from(
      new Set(
        sources
          .map(normalizeSource)
          .filter((source) => source.includes('next-devtools'))
      )
    ).sort()

    expect(devOverlaySources).toMatchInlineSnapshot(`[]`)
  })

  it('must not bundle the HMR refresh reducer into browser chunks', () => {
    const hmrReducerSources = Array.from(
      new Set(
        sources
          .map(normalizeSource)
          .filter((source) => source.includes('hmr-refresh-reducer'))
      )
    ).sort()

    expect(hmrReducerSources).toMatchInlineSnapshot(`[]`)
  })

  it('must not include heavy dependencies into browser chunks', () => {
    const heavyDependencies = Array.from(
      new Set(
        sources
          .map(normalizeSource)
          .filter((source) =>
            source.includes('dist/compiled/safe-stable-stringify')
          )
      )
    ).sort()

    expect(heavyDependencies).toMatchInlineSnapshot(`[]`)
  })

  it('must not pull server internals from next/cache into browser chunks', () => {
    // When a Client Component imports from next/cache, the bundler should
    // DCE the server require() branch (via process.env.NEXT_RUNTIME === '')
    // and only include lightweight client stubs. Pre-compiled dist/ modules
    // don't appear in sourcemaps, so we check the actual JS content.
    const serverOnlyPatterns = [
      // IncrementalCache is a class from next/dist/server used by unstable_cache
      'IncrementalCache',
    ]

    for (const pattern of serverOnlyPatterns) {
      const chunksWithPattern = jsContents.filter((content) =>
        content.includes(pattern)
      )

      if (chunksWithPattern.length > 0) {
        throw new Error(
          `Found server-only pattern "${pattern}" in ${chunksWithPattern.length} browser chunk(s). ` +
            `This likely means next/cache is pulling server internals into the client bundle. ` +
            `Ensure the server require() calls in packages/next/cache.js are behind a DCE-able branch.`
        )
      }
    }
  })
})
