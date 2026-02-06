import { FileRef, NextInstance, nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import crypto from 'crypto'

import globOrig from 'glob'
import { diff } from 'jest-diff'
const glob = promisify(globOrig)

const IGNORE_CONTENT_NEXT_REGEX = new RegExp(
  [
    // This contains the deployment id, but these changing fields are stripped by the builder
    'routes-manifest\\.json',

    // These contain the build id and deployment id (but are not deployed to the serverless function)
    '.*\\.html',
    '.*\\.rsc',
    // These are not critical, as they aren't deployed to the serverless function
    'client-build-manifest\\.json',
    'fallback-build-manifest\\.json',
  ]
    .map((v) => '(?:\\/|^)' + v + '$')
    .join('|')
)

async function readFilesNext(
  next: NextInstance
): Promise<Map<string, Map<string, string>>> {
  // These are cosmetic files which aren't deployed.
  const IGNORE = /^trace$|^trace-build$/

  const files = (
    (await glob('**/*', {
      cwd: path.join(next.testDir, next.distDir),
      nodir: true,
      dot: true,
    })) as string[]
  )
    .filter((f) => !IGNORE.test(f) && !IGNORE_CONTENT_NEXT_REGEX.test(f))
    .sort()

  return new Map([
    [
      'next',
      new Map(
        await Promise.all(
          files.map(async (f) => {
            const content = await next.readFile(path.join(next.distDir, f))
            return [f, content] as const
          })
        )
      ),
    ],
  ])
}

async function readFilesBuilder(
  next: NextInstance
): Promise<Map<string, Map<string, string>>> {
  const functions = (
    (await glob('.vercel/output/functions/*.func/.vc-config.json', {
      cwd: next.testDir,
      nodir: true,
    })) as string[]
  ).sort()

  return new Map(
    await Promise.all(
      functions.map(async (fn) => {
        let config = await next.readJSON(fn)
        let fnDir = path.dirname(fn)
        let files = [
          ...(
            await glob('**/*', {
              cwd: path.join(next.testDir, fnDir),
              nodir: true,
              dot: true,
              ignore: ['.vc-config.json'],
            })
          ).map((f) => path.join(fnDir, f)),
          ...Object.values(config.filePathMap),
        ] as string[]
        files.sort()
        return [
          fn,
          new Map(
            await Promise.all(
              files.map(async (f: string) => {
                let symlinkTarget: string | undefined = await fs
                  .readlink(path.join(next.testDir, f))
                  .catch(() => null)
                if (symlinkTarget) {
                  return [f, symlinkTarget] as const
                } else if (f.includes('node_modules')) {
                  // Use hash to avoid OOMs from loading all node_modules content
                  return [
                    f,
                    crypto
                      .createHash('sha1')
                      .update(await next.readFile(f))
                      .digest('hex'),
                  ] as const
                } else {
                  return [f, await next.readFile(f)] as const
                }
              })
            )
          ),
        ] as const
      })
    )
  )
}

async function runTest(
  next: NextInstance,
  readFiles: (next: NextInstance) => Promise<Map<string, Map<string, string>>>
) {
  // First build
  next.env['NEXT_DEPLOYMENT_ID'] = 'foo-dpl-id'
  await next.build()
  let run1 = await readFiles(next)

  // Second build
  next.env['NEXT_DEPLOYMENT_ID'] = 'bar-dpl-id'
  await next.build()
  let run2 = await readFiles(next)

  // First, compare file names
  let run1FileNames = [...run1.entries()].map(([fn, files]) => [
    fn,
    [...files.keys()],
  ])
  let run2FileNames = [...run2.entries()].map(([fn, files]) => [
    fn,
    [...files.keys()],
  ])
  expect(run1FileNames).toEqual(run2FileNames)

  let run1Map = new Map(run1)
  let run2Map = new Map(run2)

  let errors = []
  for (const [fn, files1] of run1Map) {
    const files2 = run2Map.get(fn)
    for (const [fileName, content1] of files1) {
      const content2 = files2?.get(fileName)
      if (content1 !== content2) {
        errors.push(
          `File content mismatch for ${fileName} in ${fn}\n\n` +
            diff(content1 ?? '', content2 ?? '', {
              contextLines: 2,
              expand: false,
            })
        )
      }
    }
  }
  for (const [fn, files2] of run2Map) {
    for (const [fileName, content2] of files2) {
      if (!run1Map.get(fn)?.has(fileName)) {
        errors.push(
          `File content mismatch for ${fileName} in ${fn}\n\n` +
            diff('', content2 ?? '', {
              contextLines: 2,
              expand: false,
            })
        )
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('\n\n'))
  }

  return { run1, run2 }
}

const FILES = {
  app: new FileRef(path.join(__dirname, 'app')),
  pages: new FileRef(path.join(__dirname, 'pages')),
  public: new FileRef(path.join(__dirname, 'public')),
  'instrumentation.ts': new FileRef(path.join(__dirname, 'instrumentation.ts')),
  'middleware.ts': new FileRef(path.join(__dirname, 'middleware.ts')),
  'next.config.js': `module.exports = {
    experimental: {
      // Enable these when debugging to get readable diffs
      // turbopackMinify: false,
      // turbopackModuleIds: 'named',
      // turbopackScopeHoisting: false,
    },
  }`,
}

// Webpack itself isn't deterministic
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'deterministic build - changing deployment id',
  () => {
    describe('.next folder', () => {
      const { next } = nextTestSetup({
        files: {
          ...FILES,
        },
        env: {
          NOW_BUILDER: '1',
        },
        skipStart: true,
        skipDeployment: true,
      })

      it('should produce identical build outputs even when changing deployment id', async () => {
        await runTest(next, readFilesNext)
      })
    })

    describe.each(['builder', 'adapter'])('build output API - %s', (mode) => {
      const { next } = nextTestSetup({
        files: {
          // A mock file to be able to run `vercel build` without logging in
          '.vercel/project.json': `{ "projectId": "prj_", "orgId": "team_", "settings": {} }`,
          ...FILES,
        },
        dependencies: {
          vercel: '>=50.12.1',
        },
        packageJson: {
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
        },
        buildCommand: 'pnpm vercel build',
        env:
          mode === 'adapter'
            ? {
                NEXT_ENABLE_ADAPTER: '1',
              }
            : undefined,
        skipStart: true,
        skipDeployment: true,
      })

      it('should produce identical build outputs even when changing deployment id', async () => {
        let { run1, run2 } = await runTest(next, readFilesBuilder)

        expect([...run1.keys()]).toIncludeAllMembers([
          '.vercel/output/functions/app-page.func/.vc-config.json',
          '.vercel/output/functions/app-page.rsc.func/.vc-config.json',
          '.vercel/output/functions/app-route.func/.vc-config.json',
          '.vercel/output/functions/app-route.rsc.func/.vc-config.json',
          '.vercel/output/functions/pages-dynamic.func/.vc-config.json',
          '.vercel/output/functions/pages-static-gsp.func/.vc-config.json',
        ])
        expect([...run1.keys()]).toSatisfyAny((k) =>
          k.includes('middleware.func')
        )
        expect([...run1.keys()]).toEqual([...run2.keys()])
      })
    })
  }
)
