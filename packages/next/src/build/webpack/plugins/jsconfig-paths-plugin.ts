/**
 * This webpack resolver is largely based on TypeScript's "paths" handling
 * The TypeScript license can be found here:
 * https://github.com/microsoft/TypeScript/blob/214df64e287804577afa1fea0184c18c40f7d1ca/LICENSE.txt
 */
import path from 'path'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { debug } from 'next/dist/compiled/debug'
import type { ResolvedBaseUrl } from '../../load-jsconfig'

const log = debug('next:jsconfig-paths-plugin')

export interface Pattern {
  prefix: string
  suffix: string
}

const asterisk = 0x2a

export function hasZeroOrOneAsteriskCharacter(str: string): boolean {
  let seenAsterisk = false
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === asterisk) {
      if (!seenAsterisk) {
        seenAsterisk = true
      } else {
        // have already seen asterisk
        return false
      }
    }
  }
  return true
}

/**
 * Determines whether a path starts with a relative path component (i.e. `.` or `..`).
 */
export function pathIsRelative(testPath: string): boolean {
  return /^\.\.?($|[\\/])/.test(testPath)
}

export function tryParsePattern(pattern: string): Pattern | undefined {
  // This should be verified outside of here and a proper error thrown.
  const indexOfStar = pattern.indexOf('*')
  return indexOfStar === -1
    ? undefined
    : {
        prefix: pattern.slice(0, indexOfStar),
        suffix: pattern.slice(indexOfStar + 1),
      }
}

function isPatternMatch({ prefix, suffix }: Pattern, candidate: string) {
  return (
    candidate.length >= prefix.length + suffix.length &&
    candidate.startsWith(prefix) &&
    candidate.endsWith(suffix)
  )
}

/** Return the object corresponding to the best pattern to match `candidate`. */
export function findBestPatternMatch<T>(
  values: readonly T[],
  getPattern: (value: T) => Pattern,
  candidate: string
): T | undefined {
  let matchedValue: T | undefined
  // use length of prefix as betterness criteria
  let longestMatchPrefixLength = -1

  for (const v of values) {
    const pattern = getPattern(v)
    if (
      isPatternMatch(pattern, candidate) &&
      pattern.prefix.length > longestMatchPrefixLength
    ) {
      longestMatchPrefixLength = pattern.prefix.length
      matchedValue = v
    }
  }

  return matchedValue
}

/**
 * patternStrings contains both pattern strings (containing "*") and regular strings.
 * Return an exact match if possible, or a pattern match, or undefined.
 * (These are verified by verifyCompilerOptions to have 0 or 1 "*" characters.)
 */
export function matchPatternOrExact(
  patternStrings: readonly string[],
  candidate: string
): string | Pattern | undefined {
  const patterns: Pattern[] = []
  for (const patternString of patternStrings) {
    if (!hasZeroOrOneAsteriskCharacter(patternString)) continue
    const pattern = tryParsePattern(patternString)
    if (pattern) {
      patterns.push(pattern)
    } else if (patternString === candidate) {
      // pattern was matched as is - no need to search further
      return patternString
    }
  }

  return findBestPatternMatch(patterns, (_) => _, candidate)
}

/**
 * Tests whether a value is string
 */
export function isString(text: unknown): text is string {
  return typeof text === 'string'
}

/**
 * Given that candidate matches pattern, returns the text matching the '*'.
 * E.g.: matchedText(tryParsePattern("foo*baz"), "foobarbaz") === "bar"
 */
export function matchedText(pattern: Pattern, candidate: string): string {
  return candidate.substring(
    pattern.prefix.length,
    candidate.length - pattern.suffix.length
  )
}

export function patternText({ prefix, suffix }: Pattern): string {
  return `${prefix}*${suffix}`
}

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
export class JsConfigPathsPlugin implements webpack.ResolvePluginInstance {
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
  apply(resolver: any) {
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
