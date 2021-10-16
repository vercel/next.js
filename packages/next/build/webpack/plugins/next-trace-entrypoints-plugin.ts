import nodePath from 'path'
import { Span } from '../../../trace'
import { spans } from './profiling-plugin'
import isError from '../../../lib/is-error'
import {
  nodeFileTrace,
  NodeFileTraceReasons,
} from 'next/dist/compiled/@vercel/nft'
import { TRACE_OUTPUT_VERSION } from '../../../shared/lib/constants'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import {
  nextImageLoaderRegex,
  NODE_ESM_RESOLVE_OPTIONS,
  NODE_RESOLVE_OPTIONS,
} from '../../webpack-config'
import { NextConfigComplete } from '../../../server/config-shared'

const PLUGIN_NAME = 'TraceEntryPointsPlugin'
const TRACE_IGNORES = [
  '**/*/node_modules/react/**/*.development.js',
  '**/*/node_modules/react-dom/**/*.development.js',
  '**/*/next/dist/server/next.js',
  '**/*/next/dist/bin/next',
]

function getModuleFromDependency(
  compilation: any,
  dep: any
): webpack.Module & { resource?: string } {
  return compilation.moduleGraph.getModule(dep)
}

export class TraceEntryPointsPlugin implements webpack.Plugin {
  private appDir: string
  private entryTraces: Map<string, Set<string>>
  private excludeFiles: string[]
  private esmExternals?: NextConfigComplete['experimental']['esmExternals']
  private staticImageImports?: boolean
  private externalDir?: boolean

  constructor({
    appDir,
    excludeFiles,
    esmExternals,
    staticImageImports,
    externalDir,
  }: {
    appDir: string
    excludeFiles?: string[]
    externalDir?: boolean
    staticImageImports: boolean
    esmExternals?: NextConfigComplete['experimental']['esmExternals']
  }) {
    this.appDir = appDir
    this.entryTraces = new Map()
    this.externalDir = externalDir
    this.esmExternals = esmExternals
    this.excludeFiles = excludeFiles || []
    this.staticImageImports = staticImageImports
  }

  // Here we output all traced assets and webpack chunks to a
  // ${page}.js.nft.json file
  createTraceAssets(compilation: any, assets: any, span: Span) {
    const outputPath = compilation.outputOptions.path

    const nodeFileTraceSpan = span.traceChild('create-trace-assets')
    nodeFileTraceSpan.traceFn(() => {
      for (const entrypoint of compilation.entrypoints.values()) {
        const entryFiles = new Set<string>()

        for (const chunk of entrypoint
          .getEntrypointChunk()
          .getAllReferencedChunks()) {
          for (const file of chunk.files) {
            entryFiles.add(nodePath.join(outputPath, file))
          }
          for (const file of chunk.auxiliaryFiles) {
            entryFiles.add(nodePath.join(outputPath, file))
          }
        }
        // don't include the entry itself in the trace
        entryFiles.delete(nodePath.join(outputPath, `../${entrypoint.name}.js`))
        const traceOutputName = `../${entrypoint.name}.js.nft.json`
        const traceOutputPath = nodePath.dirname(
          nodePath.join(outputPath, traceOutputName)
        )

        assets[traceOutputName] = new sources.RawSource(
          JSON.stringify({
            version: TRACE_OUTPUT_VERSION,
            files: [
              ...entryFiles,
              ...(this.entryTraces.get(entrypoint.name) || []),
            ].map((file) => {
              return nodePath
                .relative(traceOutputPath, file)
                .replace(/\\/g, '/')
            }),
          })
        )
      }
    })
  }

  tapfinishModules(
    compilation: webpack.compilation.Compilation,
    traceEntrypointsPluginSpan: Span,
    doResolve?: (
      request: string,
      parent: string,
      job: import('@vercel/nft/out/node-file-trace').Job,
      isEsmRequested: boolean
    ) => Promise<string>
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

            const depModMap = new Map<string, any>()

            finishModulesSpan.traceChild('get-entries').traceFn(() => {
              compilation.entries.forEach((entry) => {
                const name = entry.name || entry.options?.name

                if (name?.replace(/\\/g, '/').startsWith('pages/')) {
                  for (const dep of entry.dependencies) {
                    if (!dep) continue
                    const entryMod = getModuleFromDependency(compilation, dep)

                    if (entryMod && entryMod.resource) {
                      if (
                        entryMod.resource.replace(/\\/g, '/').includes('pages/')
                      ) {
                        entryNameMap.set(entryMod.resource, name)
                        entryModMap.set(entryMod.resource, entryMod)
                      } else {
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
            })

            const readFile = async (
              path: string
            ): Promise<Buffer | string | null> => {
              const mod = depModMap.get(path) || entryModMap.get(path)

              // map the transpiled source when available to avoid
              // parse errors in node-file-trace
              const source = mod?.originalSource?.()

              if (source) {
                return source.buffer()
              }

              try {
                return await new Promise((resolve, reject) => {
                  ;(
                    compilation.inputFileSystem
                      .readFile as typeof import('fs').readFile
                  )(path, (err, data) => {
                    if (err) return reject(err)
                    resolve(data)
                  })
                })
              } catch (e) {
                if (
                  isError(e) &&
                  (e.code === 'ENOENT' || e.code === 'EISDIR')
                ) {
                  return null
                }
                throw e
              }
            }
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
                  (e.code === 'EINVAL' ||
                    e.code === 'ENOENT' ||
                    e.code === 'UNKNOWN')
                ) {
                  return null
                }
                throw e
              }
            }
            const stat = async (
              path: string
            ): Promise<import('fs').Stats | null> => {
              try {
                return await new Promise((resolve, reject) => {
                  ;(
                    compilation.inputFileSystem.stat as typeof import('fs').stat
                  )(path, (err, stats) => {
                    if (err) return reject(err)
                    resolve(stats)
                  })
                })
              } catch (e) {
                if (
                  isError(e) &&
                  (e.code === 'ENOENT' || e.code === 'ENOTDIR')
                ) {
                  return null
                }
                throw e
              }
            }

            const entryPaths = Array.from(entryModMap.keys())

            const collectDependencies = (mod: any) => {
              if (!mod || !mod.dependencies) return

              for (const dep of mod.dependencies) {
                const depMod = getModuleFromDependency(compilation, dep)

                if (depMod?.resource && !depModMap.get(depMod.resource)) {
                  depModMap.set(depMod.resource, depMod)
                  collectDependencies(depMod)
                }
              }
            }
            const entriesToTrace = [...entryPaths]

            entryPaths.forEach((entry) => {
              collectDependencies(entryModMap.get(entry))
              const entryName = entryNameMap.get(entry)!
              const curExtraEntries = additionalEntries.get(entryName)

              if (curExtraEntries) {
                entriesToTrace.push(...curExtraEntries.keys())
              }
            })
            let fileList: Set<string>
            let reasons: NodeFileTraceReasons
            const root = nodePath.parse(process.cwd()).root

            await finishModulesSpan
              .traceChild('node-file-trace', {
                traceEntryCount: entriesToTrace.length + '',
              })
              .traceAsyncFn(async () => {
                const result = await nodeFileTrace(entriesToTrace, {
                  base: root,
                  processCwd: this.appDir,
                  readFile,
                  readlink,
                  stat,
                  resolve: doResolve
                    ? (id, parent, job, isCjs) =>
                        // @ts-ignore
                        doResolve(id, parent, job, !isCjs)
                    : undefined,
                  ignore: [...TRACE_IGNORES, ...this.excludeFiles],
                  mixedModules: true,
                })
                // @ts-ignore
                fileList = result.fileList
                result.esmFileList.forEach((file) => fileList.add(file))
                reasons = result.reasons
              })

            // this uses the reasons tree to collect files specific to a certain
            // parent allowing us to not have to trace each parent separately
            const parentFilesMap = new Map<string, Set<string>>()

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
                    parentFiles = new Set()
                    parentFilesMap.set(parent, parentFiles)
                  }
                  parentFiles.add(file)
                  const parentReason = reasons.get(parent)

                  if (parentReason?.parents) {
                    propagateToParents(parentReason.parents, file, seen)
                  }
                }
              }
            }

            await finishModulesSpan
              .traceChild('collect-traced-files')
              .traceAsyncFn(() => {
                for (const file of fileList!) {
                  const reason = reasons!.get(file)

                  if (!reason || reason.type === 'initial' || !reason.parents) {
                    continue
                  }
                  propagateToParents(reason.parents, file)
                }

                entryPaths.forEach((entry) => {
                  const entryName = entryNameMap.get(entry)!
                  const normalizedEntry = nodePath.relative(root, entry)
                  const curExtraEntries = additionalEntries.get(entryName)
                  const finalDeps = new Set<string>()

                  parentFilesMap.get(normalizedEntry)?.forEach((dep) => {
                    finalDeps.add(nodePath.join(root, dep))
                  })

                  if (curExtraEntries) {
                    for (const extraEntry of curExtraEntries.keys()) {
                      const normalizedExtraEntry = nodePath.relative(
                        root,
                        extraEntry
                      )
                      finalDeps.add(extraEntry)
                      parentFilesMap
                        .get(normalizedExtraEntry)
                        ?.forEach((dep) => {
                          finalDeps.add(nodePath.join(root, dep))
                        })
                    }
                  }
                  this.entryTraces.set(entryName, finalDeps)
                })
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
      const compilationSpan = spans.get(compilation) || spans.get(compiler)!
      const traceEntrypointsPluginSpan = compilationSpan.traceChild(
        'next-trace-entrypoint-plugin'
      )
      traceEntrypointsPluginSpan.traceFn(() => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          (assets: any) => {
            this.createTraceAssets(
              compilation,
              assets,
              traceEntrypointsPluginSpan
            )
          }
        )
        let resolver = compilation.resolverFactory.get('normal')

        function getPkgName(name: string) {
          const segments = name.split('/')
          if (name[0] === '@' && segments.length > 1)
            return segments.length > 1 ? segments.slice(0, 2).join('/') : null
          return segments.length ? segments[0] : null
        }

        const getResolve = (options: any) => {
          const curResolver = resolver.withOptions(options)

          return (
            parent: string,
            request: string,
            job: import('@vercel/nft/out/node-file-trace').Job
          ) =>
            new Promise<string>((resolve, reject) => {
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
                async (err: any, result: string, resContext: any) => {
                  if (err) return reject(err)

                  if (!result) {
                    return reject(new Error('module not found'))
                  }

                  try {
                    // we need to collect all parent package.json's used
                    // as webpack's resolve doesn't expose this and parent
                    // package.json could be needed for resolving e.g. stylis
                    // stylis/package.json -> stylis/dist/umd/package.json
                    if (result.includes('node_modules')) {
                      let requestPath = result.replace(/\\/g, '/')

                      if (
                        !nodePath.isAbsolute(request) &&
                        request.includes('/') &&
                        resContext?.descriptionFileRoot
                      ) {
                        requestPath = (
                          resContext.descriptionFileRoot +
                          request.substr(getPkgName(request)?.length || 0) +
                          nodePath.sep +
                          'package.json'
                        ).replace(/\\/g, '/')
                      }

                      const rootSeparatorIndex = requestPath.indexOf('/')
                      let separatorIndex: number
                      while (
                        (separatorIndex = requestPath.lastIndexOf('/')) >
                        rootSeparatorIndex
                      ) {
                        requestPath = requestPath.substr(0, separatorIndex)
                        const curPackageJsonPath = `${requestPath}/package.json`
                        if (await job.isFile(curPackageJsonPath)) {
                          await job.emitFile(
                            curPackageJsonPath,
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
                  resolve(result)
                }
              )
            })
        }

        const CJS_RESOLVE_OPTIONS = {
          ...NODE_RESOLVE_OPTIONS,
          extensions: undefined,
        }
        const ESM_RESOLVE_OPTIONS = {
          ...NODE_ESM_RESOLVE_OPTIONS,
          extensions: undefined,
        }

        const doResolve = async (
          request: string,
          parent: string,
          job: import('@vercel/nft/out/node-file-trace').Job,
          isEsmRequested: boolean
        ): Promise<string> => {
          if (this.staticImageImports && nextImageLoaderRegex.test(request)) {
            throw new Error(
              `not resolving ${request} as this is handled by next-image-loader`
            )
          }
          // When in esm externals mode, and using import, we resolve with
          // ESM resolving options.
          const esmExternals = this.esmExternals
          const looseEsmExternals = this.esmExternals === 'loose'
          const preferEsm = esmExternals && isEsmRequested
          const resolve = getResolve(
            preferEsm ? ESM_RESOLVE_OPTIONS : CJS_RESOLVE_OPTIONS
          )
          // Resolve the import with the webpack provided context, this
          // ensures we're resolving the correct version when multiple
          // exist.
          let res: string = ''
          try {
            res = await resolve(parent, request, job)
          } catch (_) {}

          // If resolving fails, and we can use an alternative way
          // try the alternative resolving options.
          if (!res && (isEsmRequested || looseEsmExternals)) {
            const resolveAlternative = getResolve(
              preferEsm ? CJS_RESOLVE_OPTIONS : ESM_RESOLVE_OPTIONS
            )
            res = await resolveAlternative(parent, request, job)
          }

          if (!res) {
            throw new Error(`failed to resolve ${request} from ${parent}`)
          }
          return res
        }

        this.tapfinishModules(
          compilation,
          traceEntrypointsPluginSpan,
          doResolve
        )
      })
    })
  }
}
