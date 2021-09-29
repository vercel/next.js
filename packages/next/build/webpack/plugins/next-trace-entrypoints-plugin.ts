import nodePath from 'path'
import { Span } from '../../../trace'
import { spans } from './profiling-plugin'
import isError from '../../../lib/is-error'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import { TRACE_OUTPUT_VERSION } from '../../../shared/lib/constants'
import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import {
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
  if (isWebpack5) {
    return compilation.moduleGraph.getModule(dep)
  }

  return dep.module
}

export class TraceEntryPointsPlugin implements webpack.Plugin {
  private appDir: string
  private entryTraces: Map<string, string[]>
  private excludeFiles: string[]
  private esmExternals: NextConfigComplete['experimental']['esmExternals']

  constructor({
    appDir,
    excludeFiles,
    esmExternals,
  }: {
    appDir: string
    excludeFiles?: string[]
    esmExternals?: NextConfigComplete['experimental']['esmExternals']
  }) {
    this.appDir = appDir
    this.entryTraces = new Map()
    this.esmExternals = esmExternals
    this.excludeFiles = excludeFiles || []
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
        entryFiles.delete(
          nodePath.join(
            outputPath,
            `${isWebpack5 ? '../' : ''}${entrypoint.name}.js`
          )
        )
        const traceOutputName = `${isWebpack5 ? '../' : ''}${
          entrypoint.name
        }.js.nft.json`
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
      context: string,
      isEsm?: boolean
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
                if (isError(e) && e.code === 'ENOENT') {
                  return null
                }
                throw e
              }
            }

            const nftCache = {}
            const entryPaths = Array.from(entryModMap.keys())

            for (const entry of entryPaths) {
              const entrySpan = finishModulesSpan.traceChild('entry', { entry })
              await entrySpan.traceAsyncFn(async () => {
                depModMap.clear()
                const entryMod = entryModMap.get(entry)
                // TODO: investigate caching, will require ensuring no traced
                // files in the cache have changed, we could potentially hash
                // all traced files and only leverage the cache if the hashes
                // match
                // const cachedTraces = entryMod.buildInfo?.cachedNextEntryTrace

                // Use cached trace if available and trace version matches
                // if (
                //   isWebpack5 &&
                //   cachedTraces &&
                //   cachedTraces.version === TRACE_OUTPUT_VERSION
                // ) {
                //   this.entryTraces.set(
                //     entryNameMap.get(entry)!,
                //     cachedTraces.tracedDeps
                //   )
                //   continue
                // }
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
                collectDependencies(entryMod)

                const toTrace: string[] = [entry]

                const entryName = entryNameMap.get(entry)!
                const curExtraEntries = additionalEntries.get(entryName)

                if (curExtraEntries) {
                  toTrace.push(...curExtraEntries.keys())
                }

                const root = nodePath.parse(process.cwd()).root
                const fileTraceSpan = entrySpan.traceChild('node-file-trace')
                const result = await fileTraceSpan.traceAsyncFn(() =>
                  nodeFileTrace(toTrace, {
                    base: root,
                    cache: nftCache,
                    processCwd: this.appDir,
                    readFile,
                    readlink,
                    stat,
                    resolve: doResolve
                      ? (id, parent, _job, isCjs) =>
                          doResolve(id, nodePath.dirname(parent), !isCjs)
                      : undefined,
                    ignore: [...TRACE_IGNORES, ...this.excludeFiles],
                    mixedModules: true,
                  })
                )

                const tracedDeps: string[] = []

                for (const file of result.fileList) {
                  if (result.reasons[file].type === 'initial') {
                    continue
                  }
                  tracedDeps.push(nodePath.join(root, file))
                }

                // entryMod.buildInfo.cachedNextEntryTrace = {
                //   version: TRACE_OUTPUT_VERSION,
                //   tracedDeps,
                // }
                this.entryTraces.set(entryName, tracedDeps)
              })
            }
          })
          .then(
            () => callback(),
            (err) => callback(err)
          )
      }
    )
  }

  apply(compiler: webpack.Compiler) {
    if (isWebpack5) {
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
          const resolver = compilation.resolverFactory.get('normal')
          const looseEsmExternals = this.esmExternals === 'loose'

          const doResolve = async (
            request: string,
            context: string,
            isEsmRequested?: boolean
          ): Promise<string> => {
            const preferEsm = isEsmRequested && this.esmExternals
            const curResolver = resolver.withOptions(
              preferEsm ? NODE_ESM_RESOLVE_OPTIONS : NODE_RESOLVE_OPTIONS
            )

            let res: string = ''
            try {
              res = await new Promise((resolve, reject) => {
                curResolver.resolve(
                  {},
                  context,
                  request,
                  {
                    fileDependencies: compilation.fileDependencies,
                    missingDependencies: compilation.missingDependencies,
                    contextDependencies: compilation.contextDependencies,
                  },
                  (err: any, result: string) => {
                    if (err) reject(err)
                    else resolve(result)
                  }
                )
              })
            } catch (err) {
              if (!(isEsmRequested && looseEsmExternals)) {
                throw err
              }
              // continue to attempt alternative resolving
            }

            if (!res && isEsmRequested && looseEsmExternals) {
              const altResolver = resolver.withOptions(
                preferEsm ? NODE_RESOLVE_OPTIONS : NODE_ESM_RESOLVE_OPTIONS
              )

              res = await new Promise((resolve, reject) => {
                altResolver.resolve(
                  {},
                  context,
                  request,
                  {
                    fileDependencies: compilation.fileDependencies,
                    missingDependencies: compilation.missingDependencies,
                    contextDependencies: compilation.contextDependencies,
                  },
                  (err: any, result: string) => {
                    if (err) reject(err)
                    else resolve(result)
                  }
                )
              })
            }

            if (!res) {
              // we should not get here as one of the two above resolves should
              // have thrown but this is here as a safeguard
              throw new Error(
                'invariant: failed to resolve ' +
                  JSON.stringify({
                    isEsmRequested,
                    looseEsmExternals,
                    request,
                    res,
                  })
              )
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
    } else {
      compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: any) => {
        const compilationSpan = spans.get(compilation)! || spans.get(compiler)
        const traceEntrypointsPluginSpan = compilationSpan.traceChild(
          'next-trace-entrypoint-plugin'
        )
        traceEntrypointsPluginSpan.traceFn(() => {
          this.createTraceAssets(
            compilation,
            compilation.assets,
            traceEntrypointsPluginSpan
          )
        })
      })

      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        const compilationSpan = spans.get(compilation)! || spans.get(compiler)
        const traceEntrypointsPluginSpan = compilationSpan.traceChild(
          'next-trace-entrypoint-plugin'
        )
        traceEntrypointsPluginSpan.traceFn(() =>
          this.tapfinishModules(compilation, traceEntrypointsPluginSpan)
        )
      })
    }
  }
}
