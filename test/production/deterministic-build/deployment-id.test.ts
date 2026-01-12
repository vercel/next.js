import { FileRef, NextInstance, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { promisify } from 'util'

import globOrig from 'glob'
import { diff } from 'jest-diff'
const glob = promisify(globOrig)

// These are cosmetic files which aren't deployed.
const IGNORE = /trace|trace-build/

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

// TODO we need to fix these case
// - static/chunks client chunks are content hashed and have the deployment id inlined
const IGNORE_NAME = /^static\/chunks\//
const IGNORE_CONTENT = new RegExp(
  [
    // These contain content-hashed browser or edge chunk urls (including the deployment id query param)
    '.*\\.html',
    '.*\\.rsc',
    'page_client-reference-manifest\\.js',
    // These contain the content-hashed browser chunk names (but they might not actually be deployed in the serverless function)
    '_buildManifest\\.js',
    'build-manifest\\.json',
    'client-build-manifest\\.json',
    'fallback-build-manifest\\.json',
    'middleware-build-manifest\\.js',
    // Contains the deploymentId which is expected to change between deployments
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
        // TODO constant generateBuildId isn't entirely representative of the real world
        'next.config.js': `module.exports = {
          generateBuildId: async () => 'default-build-id',
          // Enable these when debugging to get readable diffs
          // experimental: {
          //   turbopackMinify: false,
          //   turbopackModuleIds: 'named',
          //   turbopackScopeHoisting: false,
          // },
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

      run1 = run1.filter(([f, _]) => !IGNORE_NAME.test(f))
      run2 = run2.filter(([f, _]) => !IGNORE_NAME.test(f))

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
              diff(content1, content2)
          )
        }
      }
      if (errors.length > 0) {
        throw new Error(errors.join('\n\n'))
      }
    })
  }
)
