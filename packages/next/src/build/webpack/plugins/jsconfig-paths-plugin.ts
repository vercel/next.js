/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 */
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { debug } from 'next/dist/compiled/debug'
import type { ResolvedBaseUrl } from '../../load-jsconfig'
import {
  isString,
  matchPatternOrExact,
  matchedText,
  pathIsRelative,
  patternText,
} from '../../../lib/jsconfig-path-matcher'

const log = debug('next:jsconfig-paths-plugin')

/**
 * Calls the iterator function for each entry of the array
 * until the first result or error is reached
 */
function forEachBail<TEntry>(
  array: TEntry[],
  iterator: (
    entry: TEntry,
    entryCallback: (err?: any, result?: any) => void
  ) => void,
  callback: (err?: any, result?: any) => void
): void {
  if (array.length === 0) return callback()

  let i = 0
  const next = () => {
    let loop: boolean | undefined = undefined
    iterator(array[i++], (err, result) => {
      if (err || result !== undefined || i >= array.length) {
        return callback(err, result)
      }
      if (loop === false) while (next());
      loop = true
    })
    if (!loop) loop = false
    return loop
  }
  while (next());
}

const NODE_MODULES_REGEX = /node_modules/

type Paths = { [match: string]: string[] }

/**
 * Handles tsconfig.json or jsconfig.js "paths" option for webpack
 * Largely based on how the TypeScript compiler handles it:
 * https://github.com/microsoft/TypeScript/blob/1a9c8197fffe3dace5f8dca6633d450a88cba66d/src/compiler/moduleNameResolver.ts#L1362
 */

type NonFunction<T> = T extends Function ? never : T

// Pick the object type of ResolvePluginInstance
type ResolvePluginPlugin = NonFunction<webpack.ResolvePluginInstance>
export class JsConfigPathsPlugin implements ResolvePluginPlugin {
  paths: Paths
  resolvedBaseUrl: ResolvedBaseUrl
  jsConfigPlugin: true

  constructor(paths: Paths, resolvedBaseUrl: ResolvedBaseUrl) {
    this.paths = paths
    this.resolvedBaseUrl = resolvedBaseUrl
    this.jsConfigPlugin = true
    log('tsconfig.json or jsconfig.json paths: %O', paths)
    log('resolved baseUrl: %s', resolvedBaseUrl)
  }
  apply(resolver: webpack.Resolver) {
    const target = resolver.ensureHook('resolve')
    resolver
      .getHook('described-resolve')
      .tapAsync(
        'JsConfigPathsPlugin',
        (
          request: any,
          resolveContext: any,
          callback: (err?: any, result?: any) => void
        ) => {
          const resolvedBaseUrl = this.resolvedBaseUrl
          if (resolvedBaseUrl === undefined) {
            return callback()
          }
          const paths = this.paths
          const pathsKeys = Object.keys(paths)

          // If no aliases are added bail out
          if (pathsKeys.length === 0) {
            log('paths are empty, bailing out')
            return callback()
          }

          const moduleName = request.request

          // Exclude node_modules from paths support (speeds up resolving)
          if (request.path.match(NODE_MODULES_REGEX)) {
            log('skipping request as it is inside node_modules %s', moduleName)
            return callback()
          }

          if (
            path.posix.isAbsolute(moduleName) ||
            (process.platform === 'win32' && path.win32.isAbsolute(moduleName))
          ) {
            log('skipping request as it is an absolute path %s', moduleName)
            return callback()
          }

          if (pathIsRelative(moduleName)) {
            log('skipping request as it is a relative path %s', moduleName)
            return callback()
          }

          // log('starting to resolve request %s', moduleName)

          // If the module name does not match any of the patterns in `paths` we hand off resolving to webpack
          const matchedPattern = matchPatternOrExact(pathsKeys, moduleName)
          if (!matchedPattern) {
            log('moduleName did not match any paths pattern %s', moduleName)
            return callback()
          }

          const matchedStar = isString(matchedPattern)
            ? undefined
            : matchedText(matchedPattern, moduleName)
          const matchedPatternText = isString(matchedPattern)
            ? matchedPattern
            : patternText(matchedPattern)

          let triedPaths = []

          forEachBail(
            paths[matchedPatternText],
            (subst, pathCallback) => {
              const curPath = matchedStar
                ? subst.replace('*', matchedStar)
                : subst
              // Ensure .d.ts is not matched
              if (curPath.endsWith('.d.ts')) {
                // try next path candidate
                return pathCallback()
              }
              const candidate = path.join(resolvedBaseUrl.baseUrl, curPath)
              const obj = Object.assign({}, request, {
                request: candidate,
              })
              resolver.doResolve(
                target,
                obj,
                `Aliased with tsconfig.json or jsconfig.json ${matchedPatternText} to ${candidate}`,
                resolveContext,
                (resolverErr: any, resolverResult: any) => {
                  if (resolverErr || resolverResult === undefined) {
                    triedPaths.push(candidate)
                    // try next path candidate
                    return pathCallback()
                  }
                  return pathCallback(resolverErr, resolverResult)
                }
              )
            },
            callback
          )
        }
      )
  }
}
