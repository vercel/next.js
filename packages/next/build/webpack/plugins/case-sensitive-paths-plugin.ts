import { ResolvePlugin } from 'webpack'
import { sep as pathSeparator, normalize } from 'path'
import { promises as fs } from 'fs'

// webpack resolver plugin to verify the casing of resolved files in case it's
// run on a case-insesnitive filesystem
export default class CaseSensitivePathsPlugin implements ResolvePlugin {
  _cache: Map<string, string[]>
  _lastPurge: number
  constructor() {
    this._cache = new Map()
    this._lastPurge = Date.now()
  }
  async checkIsTrueCasePath(file: string) {
    const segments = normalize(file).split(pathSeparator)

    const segmentExistsPromises = segments.map(async (segment, i) => {
      if (i <= 0) {
        return true
      }
      const segmentParentDir =
        segments.slice(0, i).join(pathSeparator) + pathSeparator
      const cachedEntries = this._cache.get(segmentParentDir)
      const isFromCache = !!cachedEntries
      const parentDirEntries =
        cachedEntries || (await fs.readdir(segmentParentDir))
      if (!isFromCache) {
        this._cache.set(segmentParentDir, parentDirEntries)
      }
      const segmentExists = parentDirEntries.includes(segment)
      if (segmentExists) {
        return true
      }
      if (!segmentExists && isFromCache) {
        // revalidate when the cached value was used, it might have updated since
        // the cache was last written
        const freshParentDirEntries = await fs.readdir(segmentParentDir)
        this._cache.set(segmentParentDir, freshParentDirEntries)
        return freshParentDirEntries.includes(segment)
      }
      return false
    })

    return (await Promise.all(segmentExistsPromises)).every(Boolean)
  }
  apply(resolver: any) {
    resolver.getHook(`existing-file`).intercept({
      register: (tapInfo: any) => {
        if (tapInfo.name === 'NextPlugin') {
          // Prevent the NextPlugin from kicking in, we want to add another check
          // in between existing-file and resolved
          return {
            ...tapInfo,
            fn: (_req: any, _ctx: any, callback: any) => callback(),
          }
        }
        return tapInfo
      },
    })
    const resolvedHook = resolver.getHook('resolved')
    resolver
      .getHook('existing-file')
      .tapAsync(
        'CaseSensitivePathsPlugin',
        (request: any, resolveContext: any, callback: any) => {
          // purge cache when it's out of date
          const now = Date.now()
          if (now - this._lastPurge > 2000) {
            this._cache = new Map()
            this._lastPurge = now
          }

          // Don't check anything coming from node_modules, we assume these are
          // published with the correct casing
          const isIgnored =
            request.context.issuer &&
            /\/node_modules\//.test(request.context.issuer)
          const file = request.path
          if (!file || isIgnored) {
            return resolver.doResolve(
              resolvedHook,
              request,
              null,
              resolveContext,
              callback
            )
          }
          this.checkIsTrueCasePath(file).then((isTrueCasePath) => {
            if (!isTrueCasePath) {
              if (resolveContext.missing) resolveContext.missing.add(file)
              if (resolveContext.log)
                resolveContext.log(`${file} doesn't exist`)
              return callback(null, null)
            }
            resolver.doResolve(
              resolvedHook,
              request,
              `true case path: ${file}`,
              resolveContext,
              callback
            )
          }, callback)
        }
      )
  }
}
