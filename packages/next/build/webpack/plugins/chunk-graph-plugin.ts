import { Compiler, Plugin, Stats } from 'webpack'
import path from 'path'
import { EOL } from 'os'

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
          : (acc.push(getFileByIdentifier(val.identifier)), acc),
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
    compiler.hooks.emit.tap('ChunkGraphPlugin', compilation => {
      const stats = compilation.getStats().toJson()
      const modules = [
        ...(stats.chunks as any[])
          .reduce(
            (acc: any[], chunk: any) => acc.concat(chunk.modules),
            [] as any[]
          )
          .concat(stats.modules as any[])
          .filter(Boolean)
          .reduce((acc: Map<any, any>, module: any) => {
            acc.set(module.id, module)
            return acc
          }, new Map<any, any>())
          .values(),
      ]

      const files = getFiles(this.dir, modules)
      const json = JSON.stringify({ files }, null, 2) + EOL

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
