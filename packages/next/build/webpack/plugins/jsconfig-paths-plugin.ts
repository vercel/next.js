import { ResolvePlugin } from 'webpack'
import { join } from 'path'

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

export function tryParsePattern(pattern: string): Pattern | undefined {
  // This should be verified outside of here and a proper error thrown.
  const indexOfStar = pattern.indexOf('*')
  return indexOfStar === -1
    ? undefined
    : {
        prefix: pattern.substr(0, indexOfStar),
        suffix: pattern.substr(indexOfStar + 1),
      }
}

export function startsWith(str: string, prefix: string): boolean {
  return str.lastIndexOf(prefix, 0) === 0
}

export function endsWith(str: string, suffix: string): boolean {
  const expectedPos = str.length - suffix.length
  return expectedPos >= 0 && str.indexOf(suffix, expectedPos) === expectedPos
}

function isPatternMatch({ prefix, suffix }: Pattern, candidate: string) {
  return (
    candidate.length >= prefix.length + suffix.length &&
    startsWith(candidate, prefix) &&
    endsWith(candidate, suffix)
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

  return findBestPatternMatch(patterns, _ => _, candidate)
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
 * Iterates through 'array' by index and performs the callback on each element of array until the callback
 * returns a truthy value, then returns that value.
 * If no such value is found, the callback is applied to each element of array and undefined is returned.
 */
export function forEach<T, U>(
  array: readonly T[] | undefined,
  callback: (element: T, index: number) => U | undefined
): U | undefined {
  if (array) {
    for (let i = 0; i < array.length; i++) {
      const result = callback(array[i], i)
      if (result) {
        return result
      }
    }
  }
  return undefined
}

export const directorySeparator = '/'
const backslashRegExp = /\\/g

/**
 * Normalize path separators, converting `\` into `/`.
 */
export function normalizeSlashes(path: string): string {
  return path.replace(backslashRegExp, directorySeparator)
}

/**
 * Formats a parsed path consisting of a root component (at index 0) and zero or more path
 * segments (at indices > 0).
 *
 * ```ts
 * getPathFromPathComponents(["/", "path", "to", "file.ext"]) === "/path/to/file.ext"
 * ```
 */
export function getPathFromPathComponents(pathComponents: readonly string[]) {
  if (pathComponents.length === 0) return ''

  const root =
    pathComponents[0] && ensureTrailingDirectorySeparator(pathComponents[0])
  return root + pathComponents.slice(1).join(directorySeparator)
}

const slash = 0x2f
const backslash = 0x5c

/**
 * Determines whether a charCode corresponds to `/` or `\`.
 */
export function isAnyDirectorySeparator(charCode: number): boolean {
  return charCode === slash || charCode === backslash
}

/**
 * Determines whether a path has a trailing separator (`/` or `\\`).
 */
export function hasTrailingDirectorySeparator(path: string) {
  return (
    path.length > 0 && isAnyDirectorySeparator(path.charCodeAt(path.length - 1))
  )
}

export function ensureTrailingDirectorySeparator(path: string) {
  if (!hasTrailingDirectorySeparator(path)) {
    return path + directorySeparator
  }

  return path
}

export function some<T>(
  array: readonly T[] | undefined,
  predicate?: (value: T) => boolean
): boolean {
  if (array) {
    if (predicate) {
      for (const v of array) {
        if (predicate(v)) {
          return true
        }
      }
    } else {
      return array.length > 0
    }
  }
  return false
}

/**
 * Reduce an array of path components to a more simplified path by navigating any
 * `"."` or `".."` entries in the path.
 */
export function reducePathComponents(components: readonly string[]) {
  if (!some(components)) return []
  const reduced = [components[0]]
  for (let i = 1; i < components.length; i++) {
    const component = components[i]
    if (!component) continue
    if (component === '.') continue
    if (component === '..') {
      if (reduced.length > 1) {
        if (reduced[reduced.length - 1] !== '..') {
          reduced.pop()
          continue
        }
      } else if (reduced[0]) continue
    }
    reduced.push(component)
  }
  return reduced
}

const NODE_MODULES_REGEX = /node_modules/
export class JsConfigPathsPlugin implements ResolvePlugin {
  constructor(jsConfig, resolvedBaseUrl) {
    this.paths = jsConfig.compilerOptions.paths

    this.resolvedBaseUrl = resolvedBaseUrl
  }
  apply(resolver: any) {
    const paths = this.paths
    const pathsKeys = Object.keys(paths)
    const baseDirectory = this.resolvedBaseUrl
    const target = resolver.ensureHook('resolve')
    resolver
      .getHook('described-resolve')
      .tapPromise('JsConfigPathsPlugin', async (request, resolveContext) => {
        // Exclude node_modules from paths support (speeds up resolving)
        if (request.path.match(NODE_MODULES_REGEX)) {
          return
        }

        const moduleName = request.request

        // If the module name does not match any of the patterns in `paths` we hand off resolving to webpack
        const matchedPattern = matchPatternOrExact(pathsKeys, moduleName)
        if (!matchedPattern) {
          return
        }

        const matchedStar = isString(matchedPattern)
          ? undefined
          : matchedText(matchedPattern, moduleName)
        const matchedPatternText = isString(matchedPattern)
          ? matchedPattern
          : patternText(matchedPattern)

        let triedPaths = []

        for (const subst of paths[matchedPatternText]) {
          const path = matchedStar ? subst.replace('*', matchedStar) : subst
          const candidate = join(baseDirectory, path)
          const [err, result] = await new Promise((resolve, reject) => {
            const obj = Object.assign({}, request, {
              request: candidate,
            })
            resolver.doResolve(
              target,
              obj,
              `Aliased with tsconfig.json or jsconfig.json ${matchedPatternText} to ${candidate}`,
              resolveContext,
              (err, result) => {
                resolve([err, result])
              }
            )
          })

          // There's multiple paths values possible, so we first have to iterate them all first before throwing an error
          if (err || result === undefined) {
            triedPaths.push(candidate)
            continue
          }

          return result
        }

        throw new Error(`
      Request "${moduleName}" matched tsconfig.json or jsconfig.json "paths" pattern ${matchedPatternText} but could not be resolved.
      Tried paths: ${triedPaths.join(' ')}
      `)
      })
  }
}
