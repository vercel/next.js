import type { SourceMap } from 'module'
import { LRUCache } from './lru-cache'

function noSourceMap(): SourceMap | undefined {
  return undefined
}

// Edge runtime does not implement `module`
const findSourceMap =
  process.env.NEXT_RUNTIME === 'edge'
    ? noSourceMap
    : (require('module') as typeof import('module')).findSourceMap

// Edge runtime has no file system, so lazy source maps are Node.js only.
const nodeModules =
  process.env.NEXT_RUNTIME === 'edge'
    ? undefined
    : {
        fs: require('fs') as typeof import('fs'),
        path: require('path') as typeof import('path'),
        url: require('url') as typeof import('url'),
      }

/**
 * https://tc39.es/source-map/#index-map
 */
interface IndexSourceMapSection {
  offset: {
    line: number
    column: number
  }
  map: BasicSourceMapPayload
}

// TODO(veil): Upstream types
/** https://tc39.es/ecma426/#sec-index-source-map */
interface IndexSourceMap {
  version: number
  file: string
  sections: IndexSourceMapSection[]
}

/** https://tc39.es/ecma426/#sec-source-map-format */
export interface BasicSourceMapPayload {
  version: number
  // TODO: Move to https://github.com/jridgewell/sourcemaps which is actively maintained
  /** WARNING: `file` is optional. */
  file: string
  sourceRoot?: string
  // TODO: Move to https://github.com/jridgewell/sourcemaps which is actively maintained
  /** WARNING: `sources[number]` can be `null`. */
  sources: Array<string>
  names: Array<string>
  mappings: string
  ignoreList?: number[]
}

export type ModernSourceMapPayload = BasicSourceMapPayload | IndexSourceMap

// `SourceMap#payload` deep-clones the payload on every access — expensive
// for large chunk maps — so the clone is shared per `SourceMap` instance,
// which Node.js memoizes per script.
const sourceMapPayloads = new WeakMap<SourceMap, ModernSourceMapPayload>()

/**
 * Like `module.findSourceMap`, but returns the source map's payload without
 * cloning it on every call. Callers must not mutate the returned payload.
 * Throws like `module.findSourceMap` does on invalid source maps.
 *
 * Falls back to reading the source map from disk when lazy source maps are
 * enabled (see `enableLazySourceMaps`) and Node.js has none for `sourceURL`.
 */
export function findSourceMapPayload(
  sourceURL: string
): ModernSourceMapPayload | undefined {
  const sourceMap = findSourceMap(sourceURL)
  if (sourceMap === undefined) {
    return findLazySourceMapPayload(sourceURL)
  }
  let payload = sourceMapPayloads.get(sourceMap)
  if (payload === undefined) {
    payload = sourceMap.payload as ModernSourceMapPayload
    sourceMapPayloads.set(sourceMap, payload)
  }
  return payload
}

// Shared via `globalThis` because this module is compiled both into the server
// runtime bundles and into `next/dist/server`, and each copy has its own module
// state. `undefined` means lazy source maps are disabled.
const lazySourceMapPayloadsSymbol = Symbol.for(
  'next.server.lazySourceMapPayloads'
)
interface LazySourceMapEntry {
  /** `undefined` if the file has no (readable) source map. */
  payload: ModernSourceMapPayload | undefined
  /** Set if the source map is invalid, rethrown on every lookup. */
  error: unknown
  /** Size of the source map JSON, to bound the memory the cache holds. */
  size: number
}
type LazySourceMapPayloads = LRUCache<LazySourceMapEntry>
type GlobalWithLazySourceMapPayloads = typeof globalThis & {
  [lazySourceMapPayloadsSymbol]?: LazySourceMapPayloads
}

/**
 * Resolves source maps on demand, by reading the `sourceMappingURL` of the
 * generated file from disk, instead of having Node.js load them eagerly for
 * every module via `--enable-source-maps`. Some Node.js versions (e.g. v20 and
 * v22) read and parse the source map of every module they load when source
 * maps are enabled, which costs a lot during prerendering of many pages even
 * when no error is ever formatted. Enabling source maps later with
 * `process.setSourceMapsEnabled(true)` is no alternative, because Node.js
 * doesn't map modules that were loaded before.
 *
 * Has no effect when Node.js source maps are enabled anyway (e.g. via the
 * user's `NODE_OPTIONS`), because Node.js then knows the source maps already.
 */
export function enableLazySourceMaps(): void {
  const globalWithPayloads = globalThis as GlobalWithLazySourceMapPayloads
  if (globalWithPayloads[lazySourceMapPayloadsSymbol] === undefined) {
    globalWithPayloads[lazySourceMapPayloadsSymbol] = new LRUCache(
      256 * 1024 * 1024,
      // Guestimate a small entry for files without a source map so they don't
      // fill the cache.
      (entry) => Math.max(entry.size, 1024)
    )
  }
}

// Same as Node.js: the last `sourceMappingURL` comment wins, so that one in a
// string literal earlier in the file doesn't.
const sourceMappingURLComment =
  /\/[*/]#\s+sourceMappingURL=(?<sourceMappingURL>[^\s]+)/g

function findLazySourceMapPayload(
  sourceURL: string
): ModernSourceMapPayload | undefined {
  const payloads = (globalThis as GlobalWithLazySourceMapPayloads)[
    lazySourceMapPayloadsSymbol
  ]
  if (payloads === undefined || nodeModules === undefined) {
    return undefined
  }

  let entry = payloads.get(sourceURL)
  if (entry === undefined) {
    const sourceMap = readSourceMapJSONFromDisk(sourceURL, nodeModules)
    entry = { payload: undefined, error: undefined, size: 0 }
    if (sourceMap !== undefined) {
      entry.size = sourceMap.json.length
      try {
        entry.payload = sourcesToAbsolute(
          JSON.parse(sourceMap.json),
          sourceMap.url,
          nodeModules
        )
      } catch (error) {
        entry.error = error
      }
    }
    payloads.set(sourceURL, entry)
  }

  if (entry.error !== undefined) {
    // Like `module.findSourceMap` on invalid source maps, so callers report it.
    throw entry.error
  }
  return entry.payload
}

/**
 * Resolves `sources` (with `sourceRoot`) to absolute URLs relative to the
 * source map's URL, the same way Node.js does for the payloads it returns from
 * `module.findSourceMap`, so both kinds of payloads behave the same, e.g. when
 * matching a source against the `ignoreList`.
 */
function sourcesToAbsolute(
  payload: ModernSourceMapPayload,
  sourceMapURL: string,
  modules: NonNullable<typeof nodeModules>
): ModernSourceMapPayload {
  if ('sections' in payload) {
    for (const section of payload.sections) {
      sourcesToAbsolute(section.map, sourceMapURL, modules)
    }
    return payload
  }
  const { path, url } = modules
  // `sources[number]` can be `null`, see `BasicSourceMapPayload`.
  payload.sources = (payload.sources as Array<string | null>).map((source) => {
    if (source === null) {
      return source
    }
    source = (payload.sourceRoot || '') + source
    if (path.isAbsolute(source)) {
      return url.pathToFileURL(source).href
    }
    return new URL(source, sourceMapURL).href
  }) as Array<string>
  payload.sourceRoot = ''
  return payload
}

function readSourceMapJSONFromDisk(
  sourceURL: string,
  { fs, path, url }: NonNullable<typeof nodeModules>
): { json: string; url: string } | undefined {
  const { readFileSync } = fs
  const { isAbsolute } = path
  const { fileURLToPath, pathToFileURL } = url

  let generatedFileURL: URL
  try {
    if (sourceURL.startsWith('file://')) {
      generatedFileURL = new URL(sourceURL)
    } else if (isAbsolute(sourceURL)) {
      generatedFileURL = pathToFileURL(sourceURL)
    } else {
      // Not a file, e.g. `<anonymous>` or `node:internal/...`.
      return undefined
    }
  } catch {
    return undefined
  }

  let sourceMappingURL: string | undefined
  try {
    const content = readFileSync(
      /* turbopackIgnore: true */ generatedFileURL,
      'utf8'
    )
    for (const match of content.matchAll(sourceMappingURLComment)) {
      sourceMappingURL = match.groups!.sourceMappingURL
    }
  } catch {
    // e.g. the file was deleted since it was loaded.
    return undefined
  }
  if (sourceMappingURL === undefined) {
    return undefined
  }

  try {
    const sourceMapURL = new URL(sourceMappingURL, generatedFileURL)
    if (sourceMapURL.protocol === 'data:') {
      // e.g. `data:application/json;charset=utf-8;base64,eyJ2...`
      const commaIndex = sourceMapURL.pathname.indexOf(',')
      if (commaIndex === -1) {
        return undefined
      }
      const metadata = sourceMapURL.pathname.slice(0, commaIndex)
      const data = sourceMapURL.pathname.slice(commaIndex + 1)
      return {
        json: metadata.endsWith(';base64')
          ? Buffer.from(data, 'base64').toString('utf8')
          : decodeURIComponent(data),
        // Same as Node.js: inline source maps resolve against the file.
        url: generatedFileURL.href,
      }
    } else if (sourceMapURL.protocol === 'file:') {
      return {
        json: readFileSync(
          /* turbopackIgnore: true */ fileURLToPath(sourceMapURL),
          'utf8'
        ),
        url: sourceMapURL.href,
      }
    } else {
      return undefined
    }
  } catch {
    // Missing source map file or malformed URL. Same as Node.js, which treats
    // these as having no source map.
    return undefined
  }
}

export function sourceMapIgnoreListsEverything(
  sourceMap: BasicSourceMapPayload
): boolean {
  return (
    sourceMap.ignoreList !== undefined &&
    sourceMap.sources.length === sourceMap.ignoreList.length
  )
}

/**
 * Finds the sourcemap payload applicable to a given frame.
 * Equal to the input unless an Index Source Map is used.
 * @param line0 - The line number of the frame, 0-based.
 * @param column0 - The column number of the frame, 0-based.
 */
export function findApplicableSourceMapPayload(
  line0: number,
  column0: number,
  payload: ModernSourceMapPayload
): BasicSourceMapPayload | undefined {
  if ('sections' in payload) {
    if (payload.sections.length === 0) {
      return undefined
    }

    // Sections must not overlap and must be sorted: https://tc39.es/source-map/#section-object
    // Therefore the last section that has an offset less than or equal to the frame is the applicable one.
    const sections = payload.sections
    let left = 0
    let right = sections.length - 1
    let result: IndexSourceMapSection | null = null

    while (left <= right) {
      // fast Math.floor
      const middle = ~~((left + right) / 2)
      const section = sections[middle]
      const offset = section.offset

      if (
        offset.line < line0 ||
        (offset.line === line0 && offset.column <= column0)
      ) {
        result = section
        left = middle + 1
      } else {
        right = middle - 1
      }
    }

    return result === null ? undefined : result.map
  } else {
    return payload
  }
}

const didWarnAboutInvalidSourceMapDEV = new Set<string>()

export function filterStackFrameDEV(
  sourceURL: string,
  functionName: string,
  line1: number,
  column1: number
): boolean {
  if (sourceURL === '') {
    // The default implementation filters out <anonymous> stack frames
    // but we want to retain them because current Server Components and
    // built-in Components in parent stacks don't have source location.
    // Filter out frames that show up in Promises to get good names in React's
    // Server Request track until we come up with a better heuristic.
    return functionName !== 'new Promise'
  }
  if (sourceURL.startsWith('node:') || sourceURL.includes('node_modules')) {
    return false
  }
  try {
    // Cheap after the first lookup, since Node.js or the lazy source maps (see
    // `enableLazySourceMaps`) cache the source map.
    // TODO: ESM sourcemaps are O(1) but CommonJS sourcemaps are O(Number of CJS modules).
    // Make sure this doesn't adversely affect performance when CJS is used by Next.js.
    const payload = findSourceMapPayload(sourceURL)
    if (payload === undefined) {
      // No source map associated.
      return true
    }
    const sourceMapPayload = findApplicableSourceMapPayload(
      line1 - 1,
      column1 - 1,
      payload
    )
    if (sourceMapPayload === undefined) {
      // No source map section applicable to the frame.
      return true
    }
    return !sourceMapIgnoreListsEverything(sourceMapPayload)
  } catch (cause) {
    if (process.env.NODE_ENV !== 'production') {
      // TODO: Share cache with patch-error-inspect
      if (!didWarnAboutInvalidSourceMapDEV.has(sourceURL)) {
        didWarnAboutInvalidSourceMapDEV.add(sourceURL)
        // We should not log an actual error instance here because that will re-enter
        // this codepath during error inspection and could lead to infinite recursion.
        console.error(
          `${sourceURL}: Invalid source map. Only conformant source maps can be used to filter stack frames. Cause: ${cause}`
        )
      }
    }

    return true
  }
}

// `scriptNameOrSourceURL` is what React forwards from the stack frame: the
// script's `getScriptNameOrSourceURL()`, which for the server chunks we can
// map is an absolute filesystem path, not a URL. The returned value is the
// source map's URL (`file:` or `data:`).
type FindSourceMapURL = (scriptNameOrSourceURL: string) => string | null
// Find the URL of a source map using the bundler's API.
// Shared via `globalThis` because this module is compiled both into the server
// runtime bundles (which call `findSourceMapURLDEV`) and into `next/dist/server`
// (where the dev server registers the implementation), and each copy has its own
// module state.
const bundlerFindSourceMapURLSymbol = Symbol.for(
  'next.server.bundlerFindSourceMapURL'
)

export function setBundlerFindSourceMapURLImplementation(
  findSourceMapURLImplementation: FindSourceMapURL
): void {
  ;(globalThis as any)[bundlerFindSourceMapURLSymbol] =
    findSourceMapURLImplementation
}

function bundlerFindSourceMapURL(scriptNameOrSourceURL: string): string | null {
  const implementation: FindSourceMapURL | undefined = (globalThis as any)[
    bundlerFindSourceMapURLSymbol
  ]
  return implementation === undefined
    ? null
    : implementation(scriptNameOrSourceURL)
}

const invalidSourceMap = Symbol('invalid-source-map')
const sourceMapURLs = new LRUCache<string | typeof invalidSourceMap>(
  512 * 1024 * 1024,
  (url, sourceURL) =>
    sourceURL.length +
    (url === invalidSourceMap
      ? // Guestimate a small source map so invalid entries don't fill the cache.
        8 * 1024
      : // these URLs contain only ASCII characters so .length is equal to Buffer.byteLength
        url.length)
)
export function findSourceMapURLDEV(
  scriptNameOrSourceURL: string
): string | null {
  try {
    const bundlerSourceMapURL = bundlerFindSourceMapURL(scriptNameOrSourceURL)
    if (bundlerSourceMapURL !== null) {
      return bundlerSourceMapURL
    }
  } catch (cause) {
    console.error(
      `${scriptNameOrSourceURL}: Failed to find the source map URL. Cause: ${cause}`
    )
  }

  // No bundler implementation (e.g. Webpack): inline the source map Node.js
  // knows as a `data:` URL.
  let sourceMapURL = sourceMapURLs.get(scriptNameOrSourceURL)
  if (sourceMapURL === undefined) {
    let sourceMapPayload: ModernSourceMapPayload | undefined
    try {
      sourceMapPayload = findSourceMapPayload(scriptNameOrSourceURL)
    } catch (cause) {
      console.error(
        `${scriptNameOrSourceURL}: Invalid source map. Only conformant source maps can be used to find the original code. Cause: ${cause}`
      )
    }

    if (sourceMapPayload === undefined) {
      sourceMapURL = invalidSourceMap
    } else {
      // TODO: Might be more efficient to extract the relevant section from Index Maps.
      // Unclear if that search is worth the smaller payload we have to stringify.
      const sourceMapJSON = JSON.stringify(sourceMapPayload)
      const sourceMapURLData = Buffer.from(sourceMapJSON, 'utf8').toString(
        'base64'
      )
      sourceMapURL = `data:application/json;base64,${sourceMapURLData}`
    }

    sourceMapURLs.set(scriptNameOrSourceURL, sourceMapURL)
  }

  return sourceMapURL === invalidSourceMap ? null : sourceMapURL
}

export function devirtualizeReactServerURL(sourceURL: string): string {
  if (sourceURL.startsWith('about://React/')) {
    // about://React/Server/file://<filename>?42 => file://<filename>
    const envIdx = sourceURL.indexOf('/', 'about://React/'.length)
    const suffixIdx = sourceURL.lastIndexOf('?')
    if (envIdx > -1 && suffixIdx > -1) {
      return decodeURI(sourceURL.slice(envIdx + 1, suffixIdx))
    }
  }
  return sourceURL
}

function isAnonymousFrameLikelyJSNative(methodName: string): boolean {
  // Anonymous frames can also be produced in React parent stacks either from
  // host components or Server Components. We don't want to ignore those.
  // This could hide user-space methods that are named like native JS methods but
  // should you really do that?
  return (
    // e.g. JSON.parse
    methodName.startsWith('JSON.') ||
    // E.g. Promise.withResolves
    methodName.startsWith('Function.') ||
    // various JS built-ins
    methodName.startsWith('Promise.') ||
    methodName.startsWith('Array.') ||
    methodName.startsWith('Set.') ||
    methodName.startsWith('Map.')
  )
}

export function ignoreListAnonymousStackFramesIfSandwiched<Frame>(
  frames: Frame[],
  isAnonymousFrame: (frame: Frame) => boolean,
  isIgnoredFrame: (frame: Frame) => boolean,
  getMethodName: (frame: Frame) => string,
  /** only passes frames for which `isAnonymousFrame` and their method is a native JS method or `isIgnoredFrame` return true */
  ignoreFrame: (frame: Frame) => void
): void {
  for (let i = 1; i < frames.length; i++) {
    const currentFrame = frames[i]
    if (
      !(
        isAnonymousFrame(currentFrame) &&
        isAnonymousFrameLikelyJSNative(getMethodName(currentFrame))
      )
    ) {
      continue
    }

    const previousFrameIsIgnored = isIgnoredFrame(frames[i - 1])
    if (previousFrameIsIgnored && i < frames.length - 1) {
      let ignoreSandwich = false
      let j = i + 1
      for (j; j < frames.length; j++) {
        const nextFrame = frames[j]
        const nextFrameIsAnonymous =
          isAnonymousFrame(nextFrame) &&
          isAnonymousFrameLikelyJSNative(getMethodName(nextFrame))
        if (nextFrameIsAnonymous) {
          continue
        }

        const nextFrameIsIgnored = isIgnoredFrame(nextFrame)
        if (nextFrameIsIgnored) {
          ignoreSandwich = true
          break
        }
      }

      if (ignoreSandwich) {
        for (i; i < j; i++) {
          ignoreFrame(frames[i])
        }
      }
    }
  }
}
