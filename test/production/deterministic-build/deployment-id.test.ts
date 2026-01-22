import { FileRef, NextInstance, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { promisify } from 'util'

import globOrig from 'glob'
import { diff } from 'jest-diff'
const glob = promisify(globOrig)

// These are cosmetic files which aren't deployed.
const IGNORE = /^trace$|^trace-build$/

async function readFiles(next: NextInstance) {
  const files = (
    (await glob('**/*', {
      cwd: path.join(next.testDir, next.distDir),
      nodir: true,
    })) as string[]
  )
    .filter((f) => !IGNORE.test(f))
    .sort()

  return Promise.all(
    files.map(async (filePath) => {
      const content = next.readFileSync(path.join(next.distDir, filePath))
      return [filePath, content] as const
    })
  )
}

const IGNORE_CONTENT = new RegExp(
  [
    // TODO this contains "env": { "__NEXT_BUILD_ID": "taBOOu8Znzobe4G7wEG_i",
    'middleware-manifest\\.json',
    // TODO this contains the build id
    'BUILD_ID',
    // TODO this contains the build id: "/pages-static-gsp": { "dataRoute": "/_next/data/V7oVUAlS1LiV5CqrtpkAL/pages-static-gsp.json",
    'prerender-manifest\\.json',
    // TODO These contain the build id (but are not deployed to the serverless function itself)
    '.*\\.html',
    '.*\\.rsc',
    // These are not critical, as they aren't deployed to the serverless function itself
    'client-build-manifest\\.json',
    'fallback-build-manifest\\.json',
    'routes-manifest\\.json',
  ]
    .map((v) => '(?:\\/|^)' + v + '$')
    .join('|')
)

// Webpack itself isn't deterministic
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'deterministic build - changing deployment id',
  () => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(path.join(__dirname, 'app')),
        pages: new FileRef(path.join(__dirname, 'pages')),
        public: new FileRef(path.join(__dirname, 'public')),
        'instrumentation.ts': new FileRef(
          path.join(__dirname, 'instrumentation.ts')
        ),
        'middleware.ts': new FileRef(path.join(__dirname, 'middleware.ts')),
        'next.config.js': `module.exports = {
            experimental: {
              // Enable these when debugging to get readable diffs
              // turbopackMinify: false,
              // turbopackModuleIds: 'named',
              // turbopackScopeHoisting: false,
            },
          }`,
      },
      env: {
        NOW_BUILDER: '1',
      },
      skipStart: true,
    })

    it('should produce identical build outputs even when changing deployment id', async () => {
      // First build
      next.env['NEXT_DEPLOYMENT_ID'] = 'foo-dpl-id'
      await next.build()
      let run1 = await readFiles(next)

      // Second build
      next.env['NEXT_DEPLOYMENT_ID'] = 'bar-dpl-id'
      await next.build()
      let run2 = await readFiles(next)

      // First, compare file names
      let run1FileNames = run1.map(([f, _]) => f)
      let run2FileNames = run2.map(([f, _]) => f)
      expect(run1FileNames).toEqual(run2FileNames)

      // Then, compare the file contents
      run1 = run1.filter(([f, _]) => !IGNORE_CONTENT.test(f))
      run2 = run2.filter(([f, _]) => !IGNORE_CONTENT.test(f))

      let run1Map = new Map(run1)
      let run2Map = new Map(run2)

      let errors = []
      for (const [fileName, content1] of run1Map) {
        const content2 = run2Map.get(fileName)
        if (content1 !== content2) {
          errors.push(
            `File content mismatch for ${fileName}\n\n` +
              diff(content1 ?? '', content2 ?? '')
          )
        }
      }
      for (const [fileName, content2] of run2Map) {
        if (!run1Map.has(fileName)) {
          errors.push(
            `File content mismatch for ${fileName}\n\n` +
              diff('', content2 ?? '')
          )
        }
      }
      if (errors.length > 0) {
        throw new Error(errors.join('\n\n'))
      }
    })
  }
)
