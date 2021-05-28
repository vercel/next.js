import nodePath from 'path'
import { nodeFileTrace } from 'next/dist/compiled/@vercel/nft'
import {
  webpack,
  isWebpack5,
  sources,
} from 'next/dist/compiled/webpack/webpack'
import { TRACE_OUTPUT_VERSION } from '../../../next-server/lib/constants'

const PLUGIN_NAME = 'TraceEntryPointsPlugin'
const TRACE_IGNORES = [
  '**/*/node_modules/next/dist/compiled/webpack/(bundle4|bundle5).js',
  '**/*/node_modules/react/**/*.development.js',
  '**/*/node_modules/react-dom/**/*.development.js',
  '**/*/node_modules/next/dist/next-server/server/lib/squoosh/**/*.wasm',
]

function getChunkGroupFromBlock(
  compilation: any,
  block: any
): webpack.compilation.ChunkGroup {
  if (isWebpack5) {
    return compilation.chunkGraph.getBlockChunkGroup(block)
  }

  return block.chunkGroup
}

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
  private entryModMap: Map<string, any>
  private entryNameMap: Map<string, string>

  constructor({ appDir }: { appDir: string }) {
    this.appDir = appDir
    this.entryTraces = new Map()
    this.entryModMap = new Map()
    this.entryNameMap = new Map()
  }

  createTraceAssets(compilation: any, assets: any) {
    const namePathMap = new Map<string, string>()

    this.entryNameMap.forEach((value, key) => {
      namePathMap.set(value, key)
    })

    for (const entrypoint of compilation.entrypoints.values()) {
      const entryFiles = new Set<string>()
      const entryMod = this.entryModMap.get(namePathMap.get(entrypoint.name)!)

      entrypoint.getFiles().forEach((file: string) => {
        if (!file.endsWith(entrypoint.name + '.js')) {
          entryFiles.add(nodePath.join(compilation.outputOptions.path, file))
        }
      })

      for (const block of entryMod.blocks) {
        const chunkGroup = getChunkGroupFromBlock(compilation, block)

        if (!chunkGroup) {
          continue
        }

        for (const chunk of (chunkGroup as any).chunks || []) {
          chunk.files?.forEach((file: string) => {
            entryFiles.add(nodePath.join(compilation.outputOptions.path, file))
          })
        }
      }

      assets[
        `${isWebpack5 ? '../' : ''}${entrypoint.name}.nft.json`
      ] = new sources.RawSource(
        JSON.stringify({
          version: TRACE_OUTPUT_VERSION,
          files: [...entryFiles, ...this.entryTraces.get(entrypoint.name)!],
        })
      )
    }
  }

  apply(compiler: webpack.Compiler) {
    if (isWebpack5) {
      compiler.hooks.make.tap('NextJsPagesManifest', (compilation) => {
        // @ts-ignore TODO: Remove ignore when webpack 5 is stable
        compilation.hooks.processAssets.tap(
          {
            name: 'NextJsPagesManifest',
            // @ts-ignore TODO: Remove ignore when webpack 5 is stable
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONS,
          },
          (assets: any) => {
            this.createTraceAssets(compilation, assets)
          }
        )
      })
    } else {
      compiler.hooks.emit.tap('NextJsPagesManifest', (compilation: any) => {
        this.createTraceAssets(compilation, compilation.assets)
      })
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.finishModules.tapAsync(
        PLUGIN_NAME,
        async (_stats: any, callback: any) => {
          try {
            const depModMap = new Map<string, any>()

            compilation.entries.forEach((entry) => {
              const name = entry?.options?.name

              if (name?.startsWith('pages/') && entry.dependencies[0]) {
                const entryMod = getModuleFromDependency(
                  compilation,
                  entry.dependencies[0]
                )

                if (entryMod.resource) {
                  this.entryNameMap.set(entryMod.resource, name)
                  this.entryModMap.set(entryMod.resource, entryMod)
                }
              }
            })

            const readFile = (path: string) => {
              const mod = depModMap.get(path) || this.entryModMap.get(path)

              // map the transpiled source when available to avoid
              // parse errors in node-file-trace
              if (mod?._source?._valueAsBuffer) {
                return mod._source._valueAsBuffer
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
            const entryPaths = Array.from(this.entryModMap.keys())

            for (const entry of entryPaths) {
              depModMap.clear()
              const entryMod = this.entryModMap.get(entry)
              const cachedTraces = entryMod.buildInfo?.cachedNextEntryTrace

              if (isWebpack5 && cachedTraces) {
                this.entryTraces.set(
                  this.entryNameMap.get(entry)!,
                  cachedTraces
                )
                continue
              }

              for (const dep of entryMod.dependencies) {
                const depMod = getModuleFromDependency(compilation, dep)

                if (depMod?.resource) {
                  depModMap.set(depMod.resource, depMod)
                }
              }

              const toTrace: string[] = [entry, ...depModMap.keys()]

              const root = nodePath.parse(process.cwd()).root
              const result = await nodeFileTrace(toTrace, {
                base: root,
                cache: nftCache,
                processCwd: this.appDir,
                readFile,
                readlink,
                stat,
                ignore: TRACE_IGNORES,
              })

              const tracedDeps: string[] = []

              for (const file of result.fileList) {
                if (result.reasons[file].type === 'initial') {
                  continue
                }
                tracedDeps.push(nodePath.join(root, file))
              }

              entryMod.buildInfo.cachedNextEntryTrace = tracedDeps
              this.entryTraces.set(this.entryNameMap.get(entry)!, tracedDeps)
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
