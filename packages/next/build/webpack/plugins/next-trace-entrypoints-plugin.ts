import nodePath from 'path'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { TRACE_OUTPUT_VERSION } from '../../../shared/lib/constants'

const PLUGIN_NAME = 'TraceEntryPointsPlugin'
const TRACE_IGNORES = [
  '**/*/node_modules/react/**/*.development.js',
  '**/*/node_modules/react-dom/**/*.development.js',
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

  constructor({
    appDir,
    excludeFiles,
  }: {
    appDir: string
    excludeFiles?: string[]
  }) {
    this.appDir = appDir
    this.entryTraces = new Map()
    this.excludeFiles = excludeFiles || []
  }

  // Here we output all traced assets and webpack chunks to a
  // ${page}.js.nft.json file
  createTraceAssets(compilation: any, assets: any) {
    const outputPath = compilation.outputOptions.path

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
          files: [...entryFiles, ...this.entryTraces.get(entrypoint.name)!].map(
            (file) => {
              return nodePath
                .relative(traceOutputPath, file)
                .replace(/\\/g, '/')
            }
          ),
        })
      )
    }
  }

  apply(compiler: webpack.Compiler) {
    if (isWebpack5) {
      compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: PLUGIN_NAME,
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE,
          },
          (assets: any) => {
            this.createTraceAssets(compilation, assets)
          }
        )
      })
    } else {
      compiler.hooks.emit.tap(PLUGIN_NAME, (compilation: any) => {
        this.createTraceAssets(compilation, compilation.assets)
      })
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.finishModules.tapAsync(
        PLUGIN_NAME,
        async (_stats: any, callback: any) => {
          // we create entry -> module maps so that we can
          // look them up faster instead of having to iterate
          // over the compilation modules list
          const entryNameMap = new Map<string, string>()
          const entryModMap = new Map<string, any>()

          try {
            const depModMap = new Map<string, any>()

            compilation.entries.forEach((entry) => {
              const name = entry.name || entry.options?.name

              if (name?.startsWith('pages/') && entry.dependencies[0]) {
                const entryMod = getModuleFromDependency(
                  compilation,
                  entry.dependencies[0]
                )

                if (entryMod.resource) {
                  entryNameMap.set(entryMod.resource, name)
                  entryModMap.set(entryMod.resource, entryMod)
                }
              }
            })

            // TODO: investigate allowing non-sync fs calls in node-file-trace
            // for better performance
            const readFile = (path: string) => {
              const mod = depModMap.get(path) || entryModMap.get(path)

              // map the transpiled source when available to avoid
              // parse errors in node-file-trace
              const source = mod?.originalSource?.()

              if (source) {
                return source.buffer()
              }

              try {
                return compilation.inputFileSystem.readFileSync(path)
              } catch (e) {
                if (e.code === 'ENOENT' || e.code === 'EISDIR') {
                  return null
                }
                throw e
              }
            }
            const readlink = (path: string) => {
              try {
                return compilation.inputFileSystem.readlinkSync(path)
              } catch (e) {
                if (
                  e.code !== 'EINVAL' &&
                  e.code !== 'ENOENT' &&
                  e.code !== 'UNKNOWN'
                ) {
                  throw e
                }
                return null
              }
            }
            const stat = (path: string) => {
              try {
                return compilation.inputFileSystem.statSync(path)
              } catch (e) {
                if (e.code === 'ENOENT') {
                  return null
                }
                throw e
              }
            }

            const nftCache = {}
            const entryPaths = Array.from(entryModMap.keys())

            for (const entry of entryPaths) {
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

              const toTrace: string[] = [entry, ...depModMap.keys()]

              const root = nodePath.parse(process.cwd()).root
              const result = await nodeFileTrace(toTrace, {
                base: root,
                cache: nftCache,
                processCwd: this.appDir,
                readFile,
                readlink,
                stat,
                ignore: [...TRACE_IGNORES, ...this.excludeFiles],
              })

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
              this.entryTraces.set(entryNameMap.get(entry)!, tracedDeps)
            }

            callback()
          } catch (err) {
            callback(err)
          }
        }
      )
    })
  }
}
