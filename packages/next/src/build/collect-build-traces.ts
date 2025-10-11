import { Span } from '../trace'
import type { NextConfigComplete } from '../server/config-shared'

import {
  TRACE_IGNORES,
  type BuildTraceContext,
  getFilesMapFromReasons,
} from './webpack/plugins/next-trace-entrypoints-plugin'

import path from 'path'
import fs from 'fs/promises'
import { nonNullable } from '../lib/non-nullable'
import * as ciEnvironment from '../server/ci-info'
import debugOriginal from 'next/dist/compiled/debug'
import picomatch from 'next/dist/compiled/picomatch'
import { defaultOverrides } from '../server/require-hook'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import isError from '../lib/is-error'
import type { NodeFileTraceReasons } from '@vercel/nft'
import type { RoutesUsingEdgeRuntime } from './utils'

const debug = debugOriginal('next:build:build-traces')

function shouldIgnore(
  file: string,
  serverIgnoreFn: (file: string) => boolean,
  reasons: NodeFileTraceReasons,
  cachedIgnoreFiles: Map<string, boolean>,
  children: Set<string> = new Set()
) {
  if (cachedIgnoreFiles.has(file)) {
    return cachedIgnoreFiles.get(file)
  }

  if (serverIgnoreFn(file)) {
    cachedIgnoreFiles.set(file, true)
    return true
  }
  children.add(file)

  const reason = reasons.get(file)
  if (!reason || reason.parents.size === 0 || reason.type.includes('initial')) {
    cachedIgnoreFiles.set(file, false)
    return false
  }

  // if all parents are ignored the child file
  // should be ignored as well
  let allParentsIgnored = true

  for (const parent of reason.parents.values()) {
    if (!children.has(parent)) {
      children.add(parent)
      if (
        !shouldIgnore(
          parent,
          serverIgnoreFn,
          reasons,
          cachedIgnoreFiles,
          children
        )
      ) {
        allParentsIgnored = false
        break
      }
    }
  }

  cachedIgnoreFiles.set(file, allParentsIgnored)
  return allParentsIgnored
}

export async function collectBuildTraces({
  dir,
  config,
  distDir,
  edgeRuntimeRoutes,
  staticPages,
  nextBuildSpan = new Span({ name: 'build' }),
  buildTraceContext,
  outputFileTracingRoot,
}: {
  dir: string
  distDir: string
  staticPages: string[]
  outputFileTracingRoot: string
  // pageInfos is serialized when this function runs in a worker.
  edgeRuntimeRoutes: RoutesUsingEdgeRuntime
  nextBuildSpan?: Span
  config: NextConfigComplete
  buildTraceContext?: BuildTraceContext
}) {
  const startTime = Date.now()
  debug('starting build traces')

  const { outputFileTracingIncludes = {}, outputFileTracingExcludes = {} } =
    config
  const excludeGlobKeys = Object.keys(outputFileTracingExcludes)
  const includeGlobKeys = Object.keys(outputFileTracingIncludes)

  await nextBuildSpan
    .traceChild('node-file-trace-build', {
      isTurbotrace: 'false', // TODO(arlyon): remove this
    })
    .traceAsyncFn(async () => {
      const nextServerTraceOutput = path.join(
        distDir,
        'next-server.js.nft.json'
      )
      const nextMinimalTraceOutput = path.join(
        distDir,
        'next-minimal-server.js.nft.json'
      )
      const root = outputFileTracingRoot

      // Under standalone mode, we need to trace the extra IPC server and
      // worker files.
      const isStandalone = config.output === 'standalone'
      const sharedEntriesSet = Object.keys(defaultOverrides).map((value) =>
        require.resolve(value, {
          paths: [require.resolve('next/dist/server/require-hook')],
        })
      )

      const { cacheHandler } = config
      const { cacheHandlers } = config.experimental

      // ensure we trace any dependencies needed for custom
      // incremental cache handler
      if (cacheHandler) {
        sharedEntriesSet.push(
          require.resolve(
            path.isAbsolute(cacheHandler)
              ? cacheHandler
              : path.join(dir, cacheHandler)
          )
        )
      }

      // Under standalone mode, we need to ensure that the cache entry debug
      // handler is traced so it can be copied. This is only used for testing,
      // and is not used in production.
      if (
        process.env.__NEXT_TEST_MODE &&
        process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
      ) {
        sharedEntriesSet.push(
          require.resolve(
            path.isAbsolute(process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS)
              ? process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
              : path.join(
                  dir,
                  process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
                )
          )
        )
      }

      if (cacheHandlers) {
        for (const handlerPath of Object.values(cacheHandlers)) {
          if (handlerPath) {
            sharedEntriesSet.push(
              require.resolve(
                path.isAbsolute(handlerPath)
                  ? handlerPath
                  : path.join(dir, handlerPath)
              )
            )
          }
        }
      }

      const serverEntries = [
        ...sharedEntriesSet,
        ...(isStandalone
          ? [
              require.resolve('next/dist/server/lib/start-server'),
              require.resolve('next/dist/server/next'),
              require.resolve('next/dist/server/require-hook'),
            ]
          : []),
        require.resolve('next/dist/server/next-server'),
      ].filter(Boolean) as string[]

      const minimalServerEntries = [
        ...sharedEntriesSet,
        require.resolve('next/dist/compiled/next-server/server.runtime.prod'),
      ].filter(Boolean)

      const additionalIgnores = new Set<string>()

      for (const glob of excludeGlobKeys) {
        if (picomatch(glob)('next-server')) {
          outputFileTracingExcludes[glob].forEach((exclude) => {
            additionalIgnores.add(exclude)
          })
        }
      }

      const makeIgnoreFn = (ignores: string[]) => {
        // pre compile the ignore globs
        const isMatch = picomatch(ignores, {
          contains: true,
          dot: true,
        })

        return (pathname: string) => {
          if (path.isAbsolute(pathname) && !pathname.startsWith(root)) {
            return true
          }

          return isMatch(pathname)
        }
      }

      const sharedIgnores = [
        '**/next/dist/compiled/next-server/**/*.dev.js',
        ...(isStandalone ? [] : ['**/next/dist/compiled/jest-worker/**/*']),
        '**/next/dist/compiled/webpack/*',
        '**/node_modules/webpack5/**/*',
        '**/next/dist/server/lib/route-resolver*',
        'next/dist/compiled/semver/semver/**/*.js',

        ...(ciEnvironment.hasNextSupport
          ? [
              // only ignore image-optimizer code when
              // this is being handled outside of next-server
              '**/next/dist/server/image-optimizer.js',
            ]
          : []),

        ...(isStandalone ? [] : TRACE_IGNORES),
        ...additionalIgnores,
      ]

      const sharedIgnoresFn = makeIgnoreFn(sharedIgnores)

      const serverIgnores = [
        ...sharedIgnores,
        '**/node_modules/react{,-dom,-dom-server-turbopack}/**/*.development.js',
        '**/*.d.ts',
        '**/*.map',
        '**/next/dist/pages/**/*',
        ...(ciEnvironment.hasNextSupport
          ? ['**/node_modules/sharp/**/*', '**/@img/sharp-libvips*/**/*']
          : []),
      ].filter(nonNullable)
      const serverIgnoreFn = makeIgnoreFn(serverIgnores)

      const minimalServerIgnores = [
        ...serverIgnores,
        '**/next/dist/compiled/edge-runtime/**/*',
        '**/next/dist/server/web/sandbox/**/*',
        '**/next/dist/server/post-process.js',
      ]
      const minimalServerIgnoreFn = makeIgnoreFn(minimalServerIgnores)

      const routesIgnores = [
        ...sharedIgnores,
        // server chunks are provided via next-trace-entrypoints-plugin plugin
        // as otherwise all chunks are traced here and included for all pages
        // whether they are needed or not
        '**/.next/server/chunks/**',
        '**/next/dist/server/post-process.js',
      ].filter(nonNullable)

      const routeIgnoreFn = makeIgnoreFn(routesIgnores)

      const serverTracedFiles = new Set<string>()
      const minimalServerTracedFiles = new Set<string>()

      function addToTracedFiles(base: string, file: string, dest: Set<string>) {
        dest.add(
          path.relative(distDir, path.join(base, file)).replace(/\\/g, '/')
        )
      }

      if (isStandalone) {
        addToTracedFiles(
          '',
          require.resolve('next/dist/compiled/jest-worker/processChild'),
          serverTracedFiles
        )
        addToTracedFiles(
          '',
          require.resolve('next/dist/compiled/jest-worker/threadChild'),
          serverTracedFiles
        )
      }

      {
        const chunksToTrace: string[] = [
          ...(buildTraceContext?.chunksTrace?.action.input || []),
          ...serverEntries,
          ...minimalServerEntries,
        ]
        const result = await nodeFileTrace(chunksToTrace, {
          base: outputFileTracingRoot,
          processCwd: dir,
          mixedModules: true,
          async readFile(p) {
            try {
              return await fs.readFile(p, 'utf8')
            } catch (e) {
              if (isError(e) && (e.code === 'ENOENT' || e.code === 'EISDIR')) {
                // since tracing runs in parallel with static generation server
                // files might be removed from that step so tolerate ENOENT
                // errors gracefully
                return ''
              }
              throw e
            }
          },
          async readlink(p) {
            try {
              return await fs.readlink(p)
            } catch (e) {
              if (
                isError(e) &&
                (e.code === 'EINVAL' ||
                  e.code === 'ENOENT' ||
                  e.code === 'UNKNOWN')
              ) {
                return null
              }
              throw e
            }
          },
          async stat(p) {
            try {
              return await fs.stat(p)
            } catch (e) {
              if (isError(e) && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
                return null
              }
              throw e
            }
          },
          // handle shared ignores at top-level as it
          // avoids over-tracing when we don't need to
          // and speeds up total trace time
          ignore(p) {
            if (sharedIgnoresFn(p)) {
              return true
            }

            // if a chunk is attempting to be traced that isn't
            // in our initial list we need to ignore it to prevent
            // over tracing as webpack needs to be the source of
            // truth for which chunks should be included for each entry
            if (
              p.includes('.next/server/chunks') &&
              !chunksToTrace.includes(path.join(outputFileTracingRoot, p))
            ) {
              return true
            }
            return false
          },
        })
        const reasons = result.reasons
        const fileList = result.fileList
        for (const file of result.esmFileList) {
          fileList.add(file)
        }

        const parentFilesMap = getFilesMapFromReasons(fileList, reasons)
        const cachedLookupIgnore = new Map<string, boolean>()
        const cachedLookupIgnoreMinimal = new Map<string, boolean>()

        for (const [entries, tracedFiles] of [
          [serverEntries, serverTracedFiles],
          [minimalServerEntries, minimalServerTracedFiles],
        ] as Array<[string[], Set<string>]>) {
          for (const file of entries) {
            const curFiles = [
              ...(parentFilesMap
                .get(path.relative(outputFileTracingRoot, file))
                ?.keys() || []),
            ]
            tracedFiles.add(path.relative(distDir, file).replace(/\\/g, '/'))

            for (const curFile of curFiles || []) {
              const filePath = path.join(outputFileTracingRoot, curFile)

              if (
                !shouldIgnore(
                  curFile,
                  tracedFiles === minimalServerTracedFiles
                    ? minimalServerIgnoreFn
                    : serverIgnoreFn,
                  reasons,
                  tracedFiles === minimalServerTracedFiles
                    ? cachedLookupIgnoreMinimal
                    : cachedLookupIgnore
                )
              ) {
                tracedFiles.add(
                  path.relative(distDir, filePath).replace(/\\/g, '/')
                )
              }
            }
          }
        }

        const { entryNameFilesMap } = buildTraceContext?.chunksTrace || {}

        const cachedLookupIgnoreRoutes = new Map<string, boolean>()

        await Promise.all(
          [
            ...(entryNameFilesMap
              ? Object.entries(entryNameFilesMap)
              : new Map()),
          ].map(async ([entryName, entryNameFiles]) => {
            const isApp = entryName.startsWith('app/')
            const isPages = entryName.startsWith('pages/')
            let route = entryName
            if (isApp) {
              route = normalizeAppPath(route.substring('app'.length))
            }
            if (isPages) {
              route = normalizePagePath(route.substring('pages'.length))
            }

            // we don't need to trace for automatically statically optimized
            // pages as they don't have server bundles, note there is
            // the caveat with flying shuttle mode as it needs this for
            // detecting changed entries
            if (staticPages.includes(route)) {
              return
            }
            const entryOutputPath = path.join(
              distDir,
              'server',
              `${entryName}.js`
            )
            const traceOutputPath = `${entryOutputPath}.nft.json`
            const existingTrace = JSON.parse(
              await fs.readFile(traceOutputPath, 'utf8')
            ) as {
              version: number
              files: string[]
              fileHashes: Record<string, string>
            }
            const traceOutputDir = path.dirname(traceOutputPath)
            const curTracedFiles = new Set<string>()

            for (const file of [...entryNameFiles, entryOutputPath]) {
              const curFiles = [
                ...(parentFilesMap
                  .get(path.relative(outputFileTracingRoot, file))
                  ?.keys() || []),
              ]
              for (const curFile of curFiles || []) {
                if (
                  !shouldIgnore(
                    curFile,
                    routeIgnoreFn,
                    reasons,
                    cachedLookupIgnoreRoutes
                  )
                ) {
                  const filePath = path.join(outputFileTracingRoot, curFile)
                  const outputFile = path
                    .relative(traceOutputDir, filePath)
                    .replace(/\\/g, '/')
                  curTracedFiles.add(outputFile)
                }
              }
            }

            for (const file of existingTrace.files || []) {
              curTracedFiles.add(file)
            }

            await fs.writeFile(
              traceOutputPath,
              JSON.stringify({
                ...existingTrace,
                files: [...curTracedFiles].sort(),
              })
            )
          })
        )
      }

      const moduleTypes = ['app-page', 'pages']

      for (const type of moduleTypes) {
        const modulePath = require.resolve(
          `next/dist/server/route-modules/${type}/module.compiled`
        )
        const relativeModulePath = path.relative(root, modulePath)

        const contextDir = path.join(
          path.dirname(modulePath),
          'vendored',
          'contexts'
        )

        for (const item of await fs.readdir(contextDir)) {
          const itemPath = path.relative(root, path.join(contextDir, item))
          if (!serverIgnoreFn(itemPath)) {
            addToTracedFiles(root, itemPath, serverTracedFiles)
            addToTracedFiles(root, itemPath, minimalServerTracedFiles)
          }
        }
        addToTracedFiles(root, relativeModulePath, serverTracedFiles)
        addToTracedFiles(root, relativeModulePath, minimalServerTracedFiles)
      }

      const serverTracedFilesSorted = Array.from(serverTracedFiles)
      serverTracedFilesSorted.sort()
      const minimalServerTracedFilesSorted = Array.from(
        minimalServerTracedFiles
      )
      minimalServerTracedFilesSorted.sort()

      await Promise.all([
        fs.writeFile(
          nextServerTraceOutput,
          JSON.stringify({
            version: 1,
            files: serverTracedFilesSorted,
          } as {
            version: number
            files: string[]
          })
        ),
        fs.writeFile(
          nextMinimalTraceOutput,
          JSON.stringify({
            version: 1,
            files: minimalServerTracedFilesSorted,
          } as {
            version: number
            files: string[]
          })
        ),
      ])
    })

  // apply outputFileTracingIncludes/outputFileTracingExcludes after runTurbotrace
  const includeExcludeSpan = nextBuildSpan.traceChild('apply-include-excludes')
  await includeExcludeSpan.traceAsyncFn(async () => {
    const globOrig =
      require('next/dist/compiled/glob') as typeof import('next/dist/compiled/glob')
    const glob = (pattern: string): Promise<string[]> => {
      return new Promise((resolve, reject) => {
        globOrig(
          pattern,
          { cwd: dir, nodir: true, dot: true },
          (err, files) => {
            if (err) {
              return reject(err)
            }
            resolve(files)
          }
        )
      })
    }

    const { entryNameFilesMap } = buildTraceContext?.chunksTrace || {}

    await Promise.all(
      [
        ...(entryNameFilesMap ? Object.entries(entryNameFilesMap) : new Map()),
      ].map(async ([entryName]) => {
        const isApp = entryName.startsWith('app/')
        const isPages = entryName.startsWith('pages/')
        let route = entryName
        if (isApp) {
          route = normalizeAppPath(entryName)
        }
        if (isPages) {
          route = normalizePagePath(entryName)
        }

        if (staticPages.includes(route)) {
          return
        }

        // edge routes have no trace files
        if (edgeRuntimeRoutes.hasOwnProperty(route)) {
          return
        }

        const combinedIncludes = new Set<string>()
        const combinedExcludes = new Set<string>()
        for (const curGlob of includeGlobKeys) {
          const isMatch = picomatch(curGlob, { dot: true, contains: true })
          if (isMatch(route)) {
            for (const include of outputFileTracingIncludes[curGlob]) {
              combinedIncludes.add(include.replace(/\\/g, '/'))
            }
          }
        }

        for (const curGlob of excludeGlobKeys) {
          const isMatch = picomatch(curGlob, { dot: true, contains: true })
          if (isMatch(route)) {
            for (const exclude of outputFileTracingExcludes[curGlob]) {
              combinedExcludes.add(exclude)
            }
          }
        }

        if (!combinedIncludes?.size && !combinedExcludes?.size) {
          return
        }

        const traceFile = path.join(
          distDir,
          `server`,
          `${entryName}.js.nft.json`
        )
        const pageDir = path.dirname(traceFile)
        const traceContent = JSON.parse(await fs.readFile(traceFile, 'utf8'))
        const includes: string[] = []
        const resolvedTraceIncludes = new Map<string, string[]>()

        if (combinedIncludes?.size) {
          await Promise.all(
            [...combinedIncludes].map(async (includeGlob) => {
              const results = await glob(includeGlob)
              const resolvedInclude = resolvedTraceIncludes.get(
                includeGlob
              ) || [
                ...results.map((file) => {
                  return path.relative(pageDir, path.join(dir, file))
                }),
              ]
              includes.push(...resolvedInclude)
              resolvedTraceIncludes.set(includeGlob, resolvedInclude)
            })
          )
        }
        const combined = new Set([...traceContent.files, ...includes])

        if (combinedExcludes?.size) {
          const resolvedGlobs = [...combinedExcludes].map((exclude) =>
            path.join(dir, exclude)
          )

          // pre compile before forEach
          const isMatch = picomatch(resolvedGlobs, {
            dot: true,
            contains: true,
          })

          combined.forEach((file) => {
            if (isMatch(path.join(pageDir, file))) {
              combined.delete(file)
            }
          })
        }

        // overwrite trace file with custom includes/excludes
        await fs.writeFile(
          traceFile,
          JSON.stringify({
            version: traceContent.version,
            files: [...combined],
          })
        )
      })
    )
  })

  debug(`finished build tracing ${Date.now() - startTime}ms`)
}
