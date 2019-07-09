import { createHash } from 'crypto'
import fs from 'fs'
import { CLIENT_STATIC_FILES_RUNTIME_MAIN } from 'next-server/constants'
import { EOL } from 'os'
import path from 'path'
import { parse } from 'querystring'
import { Compiler, Plugin } from 'webpack'

type StringDictionary = { [pageName: string]: string[] }
const manifest: {
  sharedFiles: string[]
  pages: StringDictionary
  pageChunks: StringDictionary
  chunks: StringDictionary
} = {
  sharedFiles: [],
  pages: {},
  pageChunks: {},
  chunks: {},
}

const pageModules: StringDictionary = {}

export function getPageChunks(
  page: string
):
  | {
      external: Set<String>
      internal: Set<String>
    }
  | undefined {
  if (!manifest.pages[page] && !pageModules[page]) {
    return
  }

  const external = new Set<string>() // from node_modules
  const internal = new Set<string>() // from project
  ;[...(manifest.pages[page] || []), ...(pageModules[page] || [])].map(mod => {
    if (mod.match(/(next-server|next)\//)) {
      return null
    }

    if (mod.includes('node_modules/')) {
      if (
        mod.match(
          /node_modules\/(@babel|core-js|styled-jsx|string-hash|object-assign|process|react|react-dom|regenerator-runtime|webpack|node-libs-browser)\//
        )
      ) {
        return null
      }

      mod = mod.split('node_modules/')[1].split('/')[0]
      if (external.has(mod)) {
        return null
      }

      external.add(mod)
      return mod
    }

    // don't include the page itself
    if (mod.includes(`pages${page === '/' ? '/index' : page}`)) {
      return null
    }

    // is local e.g. ../components/Layout
    if (internal.has(mod)) {
      return null
    }

    internal.add(mod)
    return mod
  })

  return {
    external,
    internal,
  }
}

export function exportManifest({
  dir,
  fileName,
  selectivePageBuildingCacheIdentifier,
}: {
  dir: string
  fileName: string
  selectivePageBuildingCacheIdentifier: string
}) {
  const finalManifest = {
    ...manifest,
    hashes: {} as { [pageName: string]: string },
  }

  const allFiles = new Set<string>(manifest.sharedFiles)
  for (const page of Object.keys(finalManifest.pages)) {
    finalManifest.pages[page].forEach(f => allFiles.add(f))
  }

  finalManifest.hashes = [...allFiles].sort().reduce(
    (acc, cur) =>
      Object.assign(
        acc,
        fs.existsSync(path.join(dir, cur))
          ? {
              [cur]: createHash('sha1')
                .update(selectivePageBuildingCacheIdentifier)
                .update(fs.readFileSync(path.join(dir, cur)))
                .digest('hex'),
            }
          : undefined
      ),
    {}
  )

  const json = JSON.stringify(finalManifest, null, 2) + EOL
  fs.writeFileSync(fileName, json)
}

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
  private buildId: string
  private dir: string
  private distDir: string
  private isServer: boolean

  constructor(
    buildId: string,
    {
      dir,
      distDir,
      isServer,
    }: {
      dir: string
      distDir: string
      isServer: boolean
    }
  ) {
    this.buildId = buildId
    this.dir = dir
    this.distDir = distDir
    this.isServer = isServer
  }

  apply(compiler: Compiler) {
    const { dir } = this
    compiler.hooks.emit.tap('ChunkGraphPlugin', compilation => {
      const sharedFiles = [] as string[]
      const sharedChunks = [] as string[]
      const pages: StringDictionary = {}
      const pageChunks: StringDictionary = {}

      compilation.chunks.forEach(chunk => {
        if (!chunk.hasEntryModule()) {
          return
        }

        const chunkModules = new Map<any, any>()

        const queue = new Set<any>(chunk.groupsIterable)
        const chunksProcessed = new Set<any>()

        const involvedChunks = new Set<string>()

        for (const chunkGroup of queue) {
          for (const chunk of chunkGroup.chunks) {
            chunk.files.forEach((file: string) => involvedChunks.add(file))
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
        const nodeModules: string[] = []
        const files = getFiles(dir, modules)
          // we don't care about node_modules (yet) because we invalidate the
          // entirety of flying shuttle on package changes
          .filter(val => {
            // store them for build tree stats though
            const isModule = val.includes('node_modules')
            if (isModule) nodeModules.push(val)
            return !isModule
          })
          // build artifacts shouldn't be considered, so we ensure all paths
          // are outside of this directory
          .filter(val => path.relative(this.distDir, val).startsWith('..'))
          // convert from absolute path to be portable across operating systems
          // and directories
          .map(f => path.relative(dir, f))

        let pageName: string | undefined
        if (chunk.entryModule && chunk.entryModule.loaders) {
          const entryLoader = chunk.entryModule.loaders.find(
            ({
              loader,
              options,
            }: {
              loader?: string | null
              options?: string | null
            }) => loader && loader.match(/next-(\w+-)+loader/) && options
          )
          if (entryLoader) {
            const { page } = parse(entryLoader.options)
            if (typeof page === 'string' && page) {
              pageName = page
            }
          }
        }

        if (pageName) {
          if (
            pageName === '/_app' ||
            pageName === '/_error' ||
            pageName === '/_document'
          ) {
            sharedFiles.push(...files)
            sharedChunks.push(...involvedChunks)
          } else {
            pages[pageName] = files
            pageChunks[pageName] = [...involvedChunks]
          }
          pageModules[pageName] = nodeModules
        } else {
          if (chunk.name === CLIENT_STATIC_FILES_RUNTIME_MAIN) {
            sharedFiles.push(...files)
            sharedChunks.push(...involvedChunks)
          } else {
            manifest.chunks[chunk.name] = [
              ...new Set([...(manifest.chunks[chunk.name] || []), ...files]),
            ].sort()
          }
        }
      })

      const getLambdaChunk = (name: string) =>
        name.includes(this.buildId)
          ? name
              .replace(new RegExp(`${this.buildId}[\\/\\\\]`), 'client/')
              .replace(/[.]js$/, `.${this.buildId}.js`)
          : name

      manifest.sharedFiles = [
        ...new Set([...(manifest.sharedFiles || []), ...sharedFiles]),
      ].sort()

      for (const page in pages) {
        manifest.pages[page] = [
          ...new Set([...(manifest.pages[page] || []), ...pages[page]]),
        ].sort()

        // There's no chunks to save from serverless bundles
        if (!this.isServer) {
          manifest.pageChunks[page] = [
            ...new Set([
              ...(manifest.pageChunks[page] || []),
              ...pageChunks[page],
              ...pageChunks[page].map(getLambdaChunk),
              ...sharedChunks,
              ...sharedChunks.map(getLambdaChunk),
            ]),
          ].sort()
        }
      }
    })
  }
}
