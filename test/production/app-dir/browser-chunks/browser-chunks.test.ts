import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { listClientChunks } from 'next-test-utils'

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
    const serverSources = sources.filter(
      (source) =>
        /webpack:\/\/_N_E\/(\.\.\/)*src\/server\//.test(source) ||
        source.includes('next/dist/esm/server') ||
        source.includes('next/dist/server') ||
        source.includes('next-devtools/server')
    )

    if (serverSources.length > 0) {
      console.error(
        `Found the following server modules:\n  ${serverSources.join('\n  ')}\nIf any of these modules are allowed to be included in browser chunks, move them to src/shared or src/client.`
      )

      throw new Error('Did not expect any server modules in browser chunks.')
    }
  })

  it('must not bundle any dev overlay into browser chunks', () => {
    const devOverlaySources = sources.filter((source) => {
      return source.includes('next-devtools')
    })

    if (devOverlaySources.length > 0) {
      const message = `Found the following dev overlay modules:\n  ${devOverlaySources.join('\n')}`
      console.error(
        `${message}\nIf any of these modules are allowed to be included in production chunks, check the import and render conditions.`
      )

      throw new Error(
        'Did not expect any dev overlay modules in browser chunks.\n' + message
      )
    }
  })

  it('must not bundle the HMR refresh reducer into browser chunks', () => {
    const hmrReducerSources = sources.filter((source) => {
      return source.includes('hmr-refresh-reducer')
    })

    if (hmrReducerSources.length > 0) {
      const message = `Found the following HMR reducer modules:\n  ${hmrReducerSources.join('\n  ')}`

      throw new Error(
        'Did not expect the HMR refresh reducer in production browser chunks.\n' +
          message
      )
    }
  })

  it('must not include heavy dependencies into browser chunks', () => {
    const heavyDependencies = sources.filter((source) => {
      return source.includes('next/dist/compiled/safe-stable-stringify')
    })

    if (heavyDependencies.length > 0) {
      const message = `Found the following heavy dependencies:\n  ${heavyDependencies.join('\n  ')}`

      throw new Error(
        'Did not expect any heavy dependencies in browser chunks.\n' + message
      )
    }
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
