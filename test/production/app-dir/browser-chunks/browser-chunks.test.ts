import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { readdir, readFile } from 'fs/promises'

async function readFilesRecursive(
  dir: string,
  predicate: (filename: string) => boolean
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await readFilesRecursive(fullPath, predicate)))
    } else if (predicate(entry.name)) {
      results.push(await readFile(fullPath, 'utf8'))
    }
  }

  return results
}

describe('browser-chunks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  let sources: string[] = []
  let jsContents: string[] = []
  beforeAll(async () => {
    const chunksDir = join(next.testDir, '.next/static/chunks')

    const sourcemaps = await readFilesRecursive(chunksDir, (filename) =>
      filename.endsWith('.js.map')
    )
    sources = sourcemaps.flatMap((sourcemap) => JSON.parse(sourcemap).sources)

    jsContents = await readFilesRecursive(chunksDir, (filename) =>
      filename.endsWith('.js')
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
