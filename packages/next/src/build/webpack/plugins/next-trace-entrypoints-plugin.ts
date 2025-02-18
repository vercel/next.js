import nodePath from 'path'
import type { Span } from '../../../trace'
import { spans } from './profiling-plugin'
import isError from '../../../lib/is-error'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import type { NodeFileTraceReasons } from 'next/dist/compiled/@vercel/nft'
import {
  CLIENT_REFERENCE_MANIFEST,
  TRACE_OUTPUT_VERSION,
  type CompilerNameValues,
} from '../../../shared/lib/constants'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  NODE_ESM_RESOLVE_OPTIONS,
  NODE_RESOLVE_OPTIONS,
} from '../../webpack-config'
import type { NextConfigComplete } from '../../../server/config-shared'
import picomatch from 'next/dist/compiled/picomatch'
import { getModuleBuildInfo } from '../loaders/get-module-build-info'
import { getPageFilePath } from '../../entries'
import { resolveExternal } from '../../handle-externals'
import { isStaticMetadataRoute } from '../../../lib/metadata/is-metadata-route'

const PLUGIN_NAME = 'TraceEntryPointsPlugin'
export const TRACE_IGNORES = [
  '**/*/next/dist/server/next.js',
  '**/*/next/dist/bin/next',
]

const NOT_TRACEABLE = [
  '.wasm',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.bmp',
  '.svg',
]

function getModuleFromDependency(
  compilation: any,
  dep: any
): webpack.Module & { resource?: string; request?: string } {
  return compilation.moduleGraph.getModule(dep)
}

export function getFilesMapFromReasons(
  fileList: Set<string>,
  reasons: NodeFileTraceReasons,
  ignoreFn?: (file: string, parent?: string) => Boolean
) {
  // this uses the reasons tree to collect files specific to a
  // certain parent allowing us to not have to trace each parent
  // separately
  const parentFilesMap = new Map<string, Map<string, { ignored: boolean }>>()

  function propagateToParents(
    parents: Set<string>,
    file: string,
    seen = new Set<string>()
  ) {
    for (const parent of parents || []) {
      if (!seen.has(parent)) {
        seen.add(parent)
        let parentFiles = parentFilesMap.get(parent)

        if (!parentFiles) {
          parentFiles = new Map()
          parentFilesMap.set(parent, parentFiles)
        }
        const ignored = Boolean(ignoreFn?.(file, parent))
        parentFiles.set(file, { ignored })

        const parentReason = reasons.get(parent)

        if (parentReason?.parents) {
          propagateToParents(parentReason.parents, file, seen)
        }
      }
    }
  }

  for (const file of fileList!) {
    const reason = reasons!.get(file)
    const isInitial =
      reason?.type.length === 1 && reason.type.includes('initial')

    if (
      !reason ||
      !reason.parents ||
      (isInitial && reason.parents.size === 0)
    ) {
      continue
    }
    propagateToParents(reason.parents, file)
  }
  return parentFilesMap
}

export interface TurbotraceAction {
  action: 'print' | 'annotate'
  input: string[]
  contextDirectory: string
  processCwd: string
  showAll?: boolean
  memoryLimit?: number
}

export interface BuildTraceContext {
  entriesTrace?: {
    action: TurbotraceAction
    appDir: string
    outputPath: string
    depModArray: string[]
    entryNameMap: Record<string, string>
    absolutePathByEntryName: Record<string, string>
  }
  chunksTrace?: {
    action: TurbotraceAction
    outputPath: string
    entryNameFilesMap: Record<string, Array<string>>
  }
}

export class TraceEntryPointsPlugin implements webpack.WebpackPluginInstance {
  public buildTraceContext: BuildTraceContext = {}

  private rootDir: string
  private appDir: string | undefined
  private pagesDir: string | undefined
  private optOutBundlingPackages: string[]
  private appDirEnabled?: boolean
  private tracingRoot: string
  private entryTraces: Map<string, Map<string, { bundled: boolean }>>
  private traceIgnores: string[]
  private esmExternals?: NextConfigComplete['experimental']['esmExternals']
  private compilerType: CompilerNameValues

  constructor({
    rootDir,
    appDir,
    pagesDir,
    compilerType,
    optOutBundlingPackages,
    appDirEnabled,
    traceIgnores,
    esmExternals,
    outputFileTracingRoot,
  }: {
    rootDir: string
    compilerType: CompilerNameValues
    appDir: string | undefined
    pagesDir: string | undefined
    optOutBundlingPackages: string[]
    appDirEnabled?: boolean
    traceIgnores?: string[]
    outputFileTracingRoot?: string
    esmExternals?: NextConfigComplete['experimental']['esmExternals']
  }) {
    this.rootDir = rootDir
    this.appDir = appDir
    this.pagesDir = pagesDir
    this.entryTraces = new Map()
    this.esmExternals = esmExternals
    this.appDirEnabled = appDirEnabled
    this.traceIgnores = traceIgnores || []
    this.tracingRoot = outputFileTracingRoot || rootDir
    this.optOutBundlingPackages = optOutBundlingPackages
    this.compilerType = compilerType
  }

  // Here we output all traced assets and webpack chunks to a
  // ${page}.js.nft.json file
  async createTraceAssets(compilation: webpack.Compilation, span: Span) {
    const outputPath = compilation.outputOptions.path || ''

    await span.traceChild('create-trace-assets').traceAsyncFn(async () => {
      const entryFilesMap = new Map<any, Set<string>>()
      const chunksToTrace = new Set<string>()
      const entryNameFilesMap = new Map<string, Array<string>>()

      const isTraceable = (file: string) =>
        !NOT_TRACEABLE.some((suffix) => {
          return file.endsWith(suffix)
        })

      for (const entrypoint of compilation.entrypoints.values()) {
        const entryFiles = new Set<string>()

        for (const chunk of entrypoint
          .getEntrypointChunk()
          .getAllReferencedChunks()) {
          for (const file of chunk.files) {
            if (isTraceable(file)) {
              const filePath = nodePath.join(outputPath, file)
              chunksToTrace.add(filePath)
              entryFiles.add(filePath)
            }
          }
          for (const file of chunk.auxiliaryFiles) {
            if (isTraceable(file)) {
              const filePath = nodePath.join(outputPath, file)
              chunksToTrace.add(filePath)
              entryFiles.add(filePath)
            }
          }
        }
        entryFilesMap.set(entrypoint, entryFiles)
        entryNameFilesMap.set(entrypoint.name || '', [...entryFiles])
      }

      // startTrace existed and callable
      this.buildTraceContext.chunksTrace = {
        action: {
          action: 'annotate',
          input: [...chunksToTrace],
          contextDirectory: this.tracingRoot,
          processCwd: this.rootDir,
        },
        outputPath,
        entryNameFilesMap: Object.fromEntries(entryNameFilesMap),
      }

      // server compiler outputs to `server/chunks` so we traverse up
      // one, but edge-server does not so don't for that one
      const outputPrefix = this.compilerType === 'server' ? '../' : ''

      for (const [entrypoint, entryFiles] of entryFilesMap) {
        const traceOutputName = `${outputPrefix}${entrypoint.name}.js.nft.json`
        const traceOutputPath = nodePath.dirname(
          nodePath.join(outputPath, traceOutputName)
        )

        // don't include the entry itself in the trace
        entryFiles.delete(
          nodePath.join(outputPath, `${outputPrefix}${entrypoint.name}.js`)
        )

        if (entrypoint.name.startsWith('app/') && this.appDir) {
          const appDirRelativeEntryPath =
            this.buildTraceContext.entriesTrace?.absolutePathByEntryName[
              entrypoint.name
            ]?.replace(this.appDir, '')

          const entryIsStaticMetadataRoute =
            appDirRelativeEntryPath &&
            isStaticMetadataRoute(appDirRelativeEntryPath)

          // Include the client reference manifest in the trace, but not for
          // static metadata routes, for which we don't generate those.
          if (!entryIsStaticMetadataRoute) {
            entryFiles.add(
              nodePath.join(
                outputPath,
                outputPrefix,
                entrypoint.name.replace(/%5F/g, '_') +
                  '_' +
                  CLIENT_REFERENCE_MANIFEST +
                  '.js'
              )
            )
          }
        }

        const finalFiles: string[] = []

        await Promise.all(
          [
            ...new Set([
              ...entryFiles,
              ...(this.entryTraces.get(entrypoint.name)?.keys() || []),
            ]),
          ].map(async (file) => {
            const fileInfo = this.entryTraces.get(entrypoint.name)?.get(file)

            const relativeFile = nodePath
              .relative(traceOutputPath, file)
              .replace(/\\/g, '/')

            if (file) {
              if (!fileInfo?.bundled) {
                finalFiles.push(relativeFile)
              }
            }
          })
        )

        compilation.emitAsset(
          traceOutputName,
          new sources.RawSource(
            JSON.stringify({
              version: TRACE_OUTPUT_VERSION,
              files: finalFiles,
            })
          ) as unknown as webpack.sources.RawSource
        )
      }
    })
  }

  tapfinishModules(
    compilation: webpack.Compilation,
    traceEntrypointsPluginSpan: Span,
    doResolve: (
      request: string,
      parent: string,
      job: import('@vercel/nft/out/node-file-trace').Job,
      isEsmRequested: boolean
    ) => Promise<string>,
    readlink: any,
    stat: any
  ) {
    compilation.hooks.finishModules.tapAsync(
      PLUGIN_NAME,
      async (_stats: any, callback: any) => {
        const finishModulesSpan =
          traceEntrypointsPluginSpan.traceChild('finish-modules')
        await finishModulesSpan
          .traceAsyncFn(async () => {
            // we create entry -> module maps so that we can
            // look them up faster instead of having to iterate
            // over the compilation modules list
            const entryNameMap = new Map<string, string>()
            const entryModMap = new Map<string, any>()
            const additionalEntries = new Map<string, Map<string, any>>()
            const absolutePathByEntryName = new Map<string, string>()

            const depModMap = new Map<string, any>()

            await finishModulesSpan
              .traceChild('get-entries')
              .traceAsyncFn(async () => {
                for (const [name, entry] of compilation.entries.entries()) {
                  const normalizedName = name?.replace(/\\/g, '/')

                  const isPage = normalizedName.startsWith('pages/')
                  const isApp =
                    this.appDirEnabled && normalizedName.startsWith('app/')

                  if (isApp || isPage) {
                    for (const dep of entry.dependencies) {
                      if (!dep) continue
                      const entryMod = getModuleFromDependency(compilation, dep)

                      // Handle case where entry is a loader coming from Next.js.
                      // For example edge-loader or app-loader.
                      if (entryMod && entryMod.resource === '') {
                        const moduleBuildInfo = getModuleBuildInfo(entryMod)
                        // All loaders that are used to create entries have a `route` property on the buildInfo.
                        if (moduleBuildInfo.route) {
                          const absolutePath = getPageFilePath({
                            absolutePagePath:
                              moduleBuildInfo.route.absolutePagePath,
                            rootDir: this.rootDir,
                            appDir: this.appDir,
                            pagesDir: this.pagesDir,
                          })

                          // Ensures we don't handle non-pages.
                          if (
                            (this.pagesDir &&
                              absolutePath.startsWith(this.pagesDir)) ||
                            (this.appDir &&
                              absolutePath.startsWith(this.appDir))
                          ) {
                            entryModMap.set(absolutePath, entryMod)
                            entryNameMap.set(absolutePath, name)
                            absolutePathByEntryName.set(name, absolutePath)
                          }
                        }

                        // If there was no `route` property, we can assume that it was something custom instead.
                        // In order to trace these we add them to the additionalEntries map.
                        if (entryMod.request) {
                          let curMap = additionalEntries.get(name)

                          if (!curMap) {
                            curMap = new Map()
                            additionalEntries.set(name, curMap)
                          }
                          depModMap.set(entryMod.request, entryMod)
                          curMap.set(entryMod.resource, entryMod)
                        }
                      }

                      if (entryMod && entryMod.resource) {
                        entryNameMap.set(entryMod.resource, name)
                        entryModMap.set(entryMod.resource, entryMod)

                        let curMap = additionalEntries.get(name)

                        if (!curMap) {
                          curMap = new Map()
                          additionalEntries.set(name, curMap)
                        }
                        depModMap.set(entryMod.resource, entryMod)
                        curMap.set(entryMod.resource, entryMod)
                      }
                    }
                  }
                }
              })

            const readFile = async (
              path: string
            ): Promise<Buffer | string | null> => {
              const mod = depModMap.get(path) || entryModMap.get(path)

              // map the transpiled source when available to avoid
              // parse errors in node-file-trace
              let source: Buffer | string = mod?.originalSource?.()?.buffer()
              return source || ''
            }

            const entryPaths = Array.from(entryModMap.keys())

            const collectDependencies = async (mod: any, parent: string) => {
              if (!mod || !mod.dependencies) return

              for (const dep of mod.dependencies) {
                const depMod = getModuleFromDependency(compilation, dep)

                if (depMod?.resource && !depModMap.get(depMod.resource)) {
                  depModMap.set(depMod.resource, depMod)
                  await collectDependencies(depMod, parent)
                }
              }
            }
            const entriesToTrace = [...entryPaths]

            for (const entry of entryPaths) {
              await collectDependencies(entryModMap.get(entry), entry)
              const entryName = entryNameMap.get(entry)!
              const curExtraEntries = additionalEntries.get(entryName)

              if (curExtraEntries) {
                entriesToTrace.push(...curExtraEntries.keys())
              }
            }

            const contextDirectory = this.tracingRoot
            const chunks = [...entriesToTrace]

            this.buildTraceContext.entriesTrace = {
              action: {
                action: 'print',
                input: chunks,
                contextDirectory,
                processCwd: this.rootDir,
              },
              appDir: this.rootDir,
              depModArray: Array.from(depModMap.keys()),
              entryNameMap: Object.fromEntries(entryNameMap),
              absolutePathByEntryName: Object.fromEntries(
                absolutePathByEntryName
              ),
              outputPath: compilation.outputOptions.path!,
            }

            let fileList: Set<string>
            let reasons: NodeFileTraceReasons
            const ignores = [
              ...TRACE_IGNORES,
              ...this.traceIgnores,
              '**/node_modules/**',
            ]

            // pre-compile the ignore matcher to avoid repeating on every ignoreFn call
            const isIgnoreMatcher = picomatch(ignores, {
              contains: true,
              dot: true,
            })
            const ignoreFn = (path: string) => {
              return isIgnoreMatcher(path)
            }

            await finishModulesSpan
              .traceChild('node-file-trace-plugin', {
                traceEntryCount: entriesToTrace.length + '',
              })
              .traceAsyncFn(async () => {
                const result = await nodeFileTrace(entriesToTrace, {
                  base: this.tracingRoot,
                  processCwd: this.rootDir,
                  readFile,
                  readlink,
                  stat,
                  resolve: doResolve
                    ? async (id, parent, job, isCjs) => {
                        return doResolve(id, parent, job, !isCjs)
                      }
                    : undefined,
                  ignore: ignoreFn,
                  mixedModules: true,
                })
                // @ts-ignore
                fileList = result.fileList
                result.esmFileList.forEach((file) => fileList.add(file))
                reasons = result.reasons
              })

            await finishModulesSpan
              .traceChild('collect-traced-files')
              .traceAsyncFn(() => {
                const parentFilesMap = getFilesMapFromReasons(
                  fileList,
                  reasons,
                  (file) => {
                    // if a file was imported and a loader handled it
                    // we don't include it in the trace e.g.
                    // static image imports, CSS imports
                    file = nodePath.join(this.tracingRoot, file)
                    const depMod = depModMap.get(file)
                    const isAsset = reasons
                      .get(nodePath.relative(this.tracingRoot, file))
                      ?.type.includes('asset')

                    return (
                      !isAsset &&
                      Array.isArray(depMod?.loaders) &&
                      depMod.loaders.length > 0
                    )
                  }
                )

                for (const entry of entryPaths) {
                  const entryName = entryNameMap.get(entry)!
                  const normalizedEntry = nodePath.relative(
                    this.tracingRoot,
                    entry
                  )
                  const curExtraEntries = additionalEntries.get(entryName)
                  const finalDeps = new Map<string, { bundled: boolean }>()

                  // ensure we include entry source file as well for
                  // hash comparison
                  finalDeps.set(entry, {
                    bundled: true,
                  })

                  for (const [dep, info] of parentFilesMap
                    .get(normalizedEntry)
                    ?.entries() || []) {
                    finalDeps.set(nodePath.join(this.tracingRoot, dep), {
                      bundled: info.ignored,
                    })
                  }

                  if (curExtraEntries) {
                    for (const extraEntry of curExtraEntries.keys()) {
                      const normalizedExtraEntry = nodePath.relative(
                        this.tracingRoot,
                        extraEntry
                      )
                      finalDeps.set(extraEntry, { bundled: false })

                      for (const [dep, info] of parentFilesMap
                        .get(normalizedExtraEntry)
                        ?.entries() || []) {
                        finalDeps.set(nodePath.join(this.tracingRoot, dep), {
                          bundled: info.ignored,
                        })
                      }
                    }
                  }
                  this.entryTraces.set(entryName, finalDeps)
                }
              })
          })
          .then(
            () => callback(),
            (err) => callback(err)
          )
      }
    )
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      const readlink = async (path: string): Promise<string | null> => {
        try {
          return await new Promise((resolve, reject) => {
            ;(
              compilation.inputFileSystem
                .readlink as typeof import('fs').readlink
            )(path, (err, link) => {
              if (err) return reject(err)
              resolve(link)
            })
          })
        } catch (e) {
          if (
            isError(e) &&
            (e.code === 'EINVAL' || e.code === 'ENOENT' || e.code === 'UNKNOWN')
          ) {
            return null
          }
          throw e
        }
      }
      const stat = async (path: string): Promise<import('fs').Stats | null> => {
        try {
          return await new Promise((resolve, reject) => {
            ;(compilation.inputFileSystem.stat as typeof import('fs').stat)(
              path,
              (err, stats) => {
                if (err) return reject(err)
                resolve(stats)
              }
            )
          })
        } catch (e) {
          if (isError(e) && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) {
            return null
          }
          throw e
        }
      }

      const compilationSpan = spans.get(compilation) || spans.get(compiler)!
      const traceEntrypointsPluginSpan = compilationSpan.traceChild(
        'next-trace-entrypoint-plugin'
      )
      traceEntrypointsPluginSpan.traceFn(() => {
        compilation.hooks.processAssets.tapAsync(
          {
            name: PLUGIN_NAME,
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          (_, callback: any) => {
            this.createTraceAssets(compilation, traceEntrypointsPluginSpan)
              .then(() => callback())
              .catch((err) => callback(err))
          }
        )

        let resolver = compilation.resolverFactory.get('normal')

        function getPkgName(name: string) {
          const segments = name.split('/')
          if (name[0] === '@' && segments.length > 1)
            return segments.length > 1 ? segments.slice(0, 2).join('/') : null
          return segments.length ? segments[0] : null
        }

        const getResolve = (
          options: Parameters<typeof resolver.withOptions>[0]
        ) => {
          const curResolver = resolver.withOptions(options)

          return (
            parent: string,
            request: string,
            job: import('@vercel/nft/out/node-file-trace').Job
          ) =>
            new Promise<[string, boolean]>((resolve, reject) => {
              const context = nodePath.dirname(parent)

              curResolver.resolve(
                {},
                context,
                request,
                {
                  fileDependencies: compilation.fileDependencies,
                  missingDependencies: compilation.missingDependencies,
                  contextDependencies: compilation.contextDependencies,
                },
                async (err: any, result?, resContext?) => {
                  if (err) return reject(err)

                  if (!result) {
                    return reject(new Error('module not found'))
                  }

                  // webpack resolver doesn't strip loader query info
                  // from the result so use path instead
                  if (result.includes('?') || result.includes('!')) {
                    result = resContext?.path || result
                  }

                  try {
                    // we need to collect all parent package.json's used
                    // as webpack's resolve doesn't expose this and parent
                    // package.json could be needed for resolving e.g. stylis
                    // stylis/package.json -> stylis/dist/umd/package.json
                    if (result.includes('node_modules')) {
                      let requestPath = result
                        .replace(/\\/g, '/')
                        .replace(/\0/g, '')

                      if (
                        !nodePath.isAbsolute(request) &&
                        request.includes('/') &&
                        resContext?.descriptionFileRoot
                      ) {
                        requestPath = (
                          resContext.descriptionFileRoot +
                          request.slice(getPkgName(request)?.length || 0) +
                          nodePath.sep +
                          'package.json'
                        )
                          .replace(/\\/g, '/')
                          .replace(/\0/g, '')
                      }

                      const rootSeparatorIndex = requestPath.indexOf('/')
                      let separatorIndex: number
                      while (
                        (separatorIndex = requestPath.lastIndexOf('/')) >
                        rootSeparatorIndex
                      ) {
                        requestPath = requestPath.slice(0, separatorIndex)
                        const curPackageJsonPath = `${requestPath}/package.json`
                        if (await job.isFile(curPackageJsonPath)) {
                          await job.emitFile(
                            await job.realpath(curPackageJsonPath),
                            'resolve',
                            parent
                          )
                        }
                      }
                    }
                  } catch (_err) {
                    // we failed to resolve the package.json boundary,
                    // we don't block emitting the initial asset from this
                  }
                  resolve([result, options.dependencyType === 'esm'])
                }
              )
            })
        }

        const CJS_RESOLVE_OPTIONS = {
          ...NODE_RESOLVE_OPTIONS,
          fullySpecified: undefined,
          modules: undefined,
          extensions: undefined,
        }
        const BASE_CJS_RESOLVE_OPTIONS = {
          ...CJS_RESOLVE_OPTIONS,
          alias: false,
        }
        const ESM_RESOLVE_OPTIONS = {
          ...NODE_ESM_RESOLVE_OPTIONS,
          fullySpecified: undefined,
          modules: undefined,
          extensions: undefined,
        }
        const BASE_ESM_RESOLVE_OPTIONS = {
          ...ESM_RESOLVE_OPTIONS,
          alias: false,
        }

        const doResolve = async (
          request: string,
          parent: string,
          job: import('@vercel/nft/out/node-file-trace').Job,
          isEsmRequested: boolean
        ): Promise<string> => {
          const context = nodePath.dirname(parent)
          // When in esm externals mode, and using import, we resolve with
          // ESM resolving options.
          const { res } = await resolveExternal(
            this.rootDir,
            this.esmExternals,
            context,
            request,
            isEsmRequested,
            this.optOutBundlingPackages,
            (options) => (_: string, resRequest: string) => {
              return getResolve(options)(parent, resRequest, job)
            },
            undefined,
            undefined,
            ESM_RESOLVE_OPTIONS,
            CJS_RESOLVE_OPTIONS,
            BASE_ESM_RESOLVE_OPTIONS,
            BASE_CJS_RESOLVE_OPTIONS
          )

          if (!res) {
            throw new Error(`failed to resolve ${request} from ${parent}`)
          }
          return res.replace(/\0/g, '')
        }

        this.tapfinishModules(
          compilation,
          traceEntrypointsPluginSpan,
          doResolve,
          readlink,
          stat
        )
      })
    })
  }
}
