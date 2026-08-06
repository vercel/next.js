import { NextInstance, nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs/promises'
import { promisify } from 'util'
import crypto from 'crypto'

import globOrig from 'glob'
import { diff } from 'jest-diff'
const glob = promisify(globOrig)
import { FILES } from './files'

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

const IGNORE = /(^|\/)(trace|trace-build)$/

async function readFilesNext(
  next: NextInstance
): Promise<Map<string, Map<string, string>>> {
  const files = (
    (await glob('**/*', {
      cwd: path.join(next.testDir, next.distDir),
      nodir: true,
      dot: true,
      ignore: 'cache/**',
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
  const statics = (
    (await glob('.vercel/output/static/**/*', {
      cwd: next.testDir,
      nodir: true,
    })) as string[]
  )
    .sort()
    // HTML Prerenders contain `<html data-dpl-id="foo-dpl-id">`
    .filter((f) => !f.endsWith('.html') && !IGNORE.test(f))

  return new Map([
    [
      'static' as string,
      new Map(
        await Promise.all(
          statics.map(async (f) => {
            return [f, await next.readFile(f)] as const
          })
        )
      ),
    ] as const,
    ...(await Promise.all(
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
    )),
  ])
}

async function runTest(
  next: NextInstance,
  readFiles: (next: NextInstance) => Promise<Map<string, Map<string, string>>>
) {
  // Same for both builds
  next.env['__NEXT_SUPPORTS_IMMUTABLE_ASSETS'] = '1'

  // First build
  next.env['NEXT_DEPLOYMENT_ID'] = 'foo-dpl-id'
  expect((await next.build()).exitCode).toBe(0)
  let run1 = await readFiles(next)

  // Second build
  next.env['NEXT_DEPLOYMENT_ID'] = 'bar-dpl-id'
  expect((await next.build()).exitCode).toBe(0)
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

// Webpack itself isn't deterministic
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'deterministic build - changing deployment id',
  () => {
    describe('standard - .next folder', () => {
      const { next } = nextTestSetup({
        files: {
          ...FILES.standard,
        },
        env: {
          NOW_BUILDER: '1',
        },
        skipStart: true,
        disableAutoSkewProtection: true,
      })

      it('should produce identical build outputs even when changing deployment id', async () => {
        await runTest(next, readFilesNext)
      })
    })

    describe.each([
      { test: 'standard', mode: 'builder' } as const,
      { test: 'standard', mode: 'adapter' } as const,
      { test: 'cacheComponents', mode: 'builder' } as const,
      { test: 'cacheComponents', mode: 'adapter' } as const,
    ])('build output API - $test $mode', ({ test, mode }) => {
      const { next } = nextTestSetup({
        files: {
          // A mock file to be able to run `vercel build` without logging in
          '.vercel/project.json': `{ "projectId": "prj_", "orgId": "team_", "settings": {} }`,
          ...FILES[test],
        },
        packageJson: {
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
        },
        // We use NEXT_TEST_PREFER_OFFLINE, so just declaring `vercel: latest` as a dependency still
        // doesn't force the latest version.
        buildCommand: 'pnpm dlx vercel@latest build',
        env:
          mode === 'adapter'
            ? {
                NEXT_ENABLE_ADAPTER: '1',
              }
            : undefined,
        skipStart: true,
        disableAutoSkewProtection: true,
      })

      it(
        'should produce identical build outputs even when changing deployment id',
        async () => {
          let { run1, run2 } = await runTest(next, readFilesBuilder)

          expect(run1.size).toBeGreaterThan(0)
          expect([...run1.keys()]).toEqual([...run2.keys()])

          if (test === 'standard') {
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
          }
        },
        // The builder mode can take a bit longer, so we increase the timeout
        // for these tests. The adapter mode should be faster, so we leave it as
        // the default.
        mode === 'builder' ? 120_000 : undefined
      )
    })
  }
)
