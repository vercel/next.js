import { ResolvePlugin } from 'webpack'
import { join, sep as pathSeparator, normalize } from 'path'
import { promisify } from 'util'
import { promises as fs } from 'fs'

async function checkIsTrueCasePath(file: string, readdir: typeof fs.readdir) {
  const segments = normalize(file).split(pathSeparator).filter(Boolean)

  const segmentExistsPromises = segments.map(async (segment, i) => {
    const segmentParentDir = join('/', ...segments.slice(0, i))
    const parentDirEntries = await readdir(segmentParentDir)
    return parentDirEntries.includes(segment)
  })

  return (await Promise.all(segmentExistsPromises)).every(Boolean)
}

// webpack resolver plugin to verify the casing of resolved files in case it's
// run on a case-insesnitive filesystem
export default class CaseSensitivePathsPlugin implements ResolvePlugin {
  apply(resolver: any) {
    // Make sure to use a cached file system to deduplicate readdir calls
    // for the same folder
    const readdir: typeof fs.readdir = promisify(
      resolver.fileSystem.readdir.bind(resolver.fileSystem)
    )
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
    resolver
      .getHook('existing-file')
      .tapAsync(
        'CaseSensitivePathsPlugin',
        (request: any, resolveContext: any, callback: any) => {
          // Don't check anything coming from node_modules, we assume these are
          // published with the correct casing
          const isIgnored =
            request.context.issuer &&
            /\/node_modules\//.test(request.context.issuer)
          const file = request.path
          if (!file || isIgnored) {
            return resolver.doResolve(
              resolver.hooks.resolved,
              request,
              `true case path ${file}`,
              resolveContext,
              callback
            )
          }
          checkIsTrueCasePath(file, readdir).then((isTrueCasePath) => {
            if (!isTrueCasePath) {
              // Can't resolve these
              return callback()
            }
            resolver.doResolve(
              resolver.hooks.resolved,
              request,
              null,
              resolveContext,
              callback
            )
          }, callback)
        }
      )
  }
}
