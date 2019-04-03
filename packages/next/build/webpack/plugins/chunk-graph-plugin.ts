import { Compiler, Plugin } from 'webpack'
import path from 'path'
import { EOL } from 'os'
import { parse } from 'querystring'
import { CLIENT_STATIC_FILES_RUNTIME_MAIN } from 'next-server/constants'

function getFiles(dir: string, modules: any[]): string[] {
  if (!(modules && modules.length)) {
    return []
  }

  function getFileByIdentifier(id: string) {
    if (id.startsWith('external ') || id.startsWith('multi ')) {
      return null
    }

    let n
    if ((n = id.lastIndexOf('!')) !== -1) {
      id = id.substring(n + 1)
    }

    if (id && !path.isAbsolute(id)) {
      id = path.resolve(dir, id)
    }

    return id
  }

  return modules
    .reduce(
      (acc: any[], val: any) =>
        val.modules
          ? acc.concat(getFiles(dir, val.modules))
          : (acc.push(
              getFileByIdentifier(
                typeof val.identifier === 'function'
                  ? val.identifier()
                  : val.identifier
              )
            ),
            acc),
      []
    )
    .filter(Boolean)
}

export class ChunkGraphPlugin implements Plugin {
  private dir: string
  private filename: string

  constructor(dir: string, { filename }: { filename?: string } = {}) {
    this.dir = dir
    this.filename = filename || 'chunk-graph-manifest.json'
  }

  apply(compiler: Compiler) {
    const { dir } = this
    compiler.hooks.emit.tap('ChunkGraphPlugin', compilation => {
      type StringDictionary = { [pageName: string]: string[] }
      const manifest: { pages: StringDictionary; chunks: StringDictionary } = {
        pages: {},
        chunks: {},
      }

      let clientRuntime = [] as string[]
      const pages: StringDictionary = {}

      compilation.chunks.forEach(chunk => {
        if (!chunk.hasEntryModule()) {
          return
        }

        const chunkModules = new Map<any, any>()

        const queue = new Set<any>(chunk.groupsIterable)
        const chunksProcessed = new Set<any>()

        for (const chunkGroup of queue) {
          for (const chunk of chunkGroup.chunks) {
            if (!chunksProcessed.has(chunk)) {
              chunksProcessed.add(chunk)
              for (const m of chunk.modulesIterable) {
                chunkModules.set(m.id, m)
              }
            }
          }
          for (const child of chunkGroup.childrenIterable) {
            queue.add(child)
          }
        }

        const modules = [...chunkModules.values()]
        const files = getFiles(dir, modules)
          .filter(val => !val.includes('node_modules'))
          .map(f => path.relative(dir, f))
          .sort()

        let pageName: string | undefined
        if (chunk.entryModule && chunk.entryModule.loaders) {
          const entryLoader = chunk.entryModule.loaders.find(
            ({
              loader,
              options,
            }: {
              loader?: string | null
              options?: string | null
            }) =>
              loader && loader.includes('next-client-pages-loader') && options
          )
          if (entryLoader) {
            const { page } = parse(entryLoader.options)
            if (typeof page === 'string' && page) {
              pageName = page
            }
          }
        }

        if (pageName) {
          pages[pageName] = files
        } else {
          if (chunk.name === CLIENT_STATIC_FILES_RUNTIME_MAIN) {
            clientRuntime = files
          } else {
            manifest.chunks[chunk.name] = files
          }
        }

        for (const page in pages) {
          manifest.pages[page] = [...pages[page], ...clientRuntime]
        }
      })

      const json = JSON.stringify(manifest, null, 2) + EOL
      compilation.assets[this.filename] = {
        source() {
          return json
        },
        size() {
          return json.length
        },
      }
    })
  }
}
