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

// `fs`/`path`/`url` are Node builtins with no edge-runtime implementation. These `require()`s must
// live in a branch that constant-folds away for edge (`DefinePlugin` replaces
// `process.env.NEXT_RUNTIME` with the literal `'edge'`, then DCE drops the dead branch) so the edge
// bundler never tries to resolve them — a runtime `if` guard is not enough, as the bundler still
// resolves `require()` calls in reachable code. Mirrors `findSourceMap` above. This module is
// bundled into the edge SSR runtime via `patch-error-inspect.ts`, so these paths must stay
// resolution-free there.
const nodeFs =
  process.env.NEXT_RUNTIME === 'edge'
    ? undefined
    : (require('fs') as typeof import('fs'))
const nodePath =
  process.env.NEXT_RUNTIME === 'edge'
    ? undefined
    : (require('path') as typeof import('path'))
const nodeFileURLToPath =
  process.env.NEXT_RUNTIME === 'edge'
    ? undefined
    : (require('url') as typeof import('url')).fileURLToPath

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
 */
export function findSourceMapPayload(
  sourceURL: string
): ModernSourceMapPayload | undefined {
  const sourceMap = findSourceMap(sourceURL)
  if (sourceMap === undefined) {
    return undefined
  }
  let payload = sourceMapPayloads.get(sourceMap)
  if (payload === undefined) {
    payload = sourceMap.payload as ModernSourceMapPayload
    sourceMapPayloads.set(sourceMap, payload)
  }
  return payload
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
    // Node.js loads source maps eagerly so this call is cheap.
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

/**
 * Prefix of the on-demand source-content dev endpoint. Source maps emitted in dev (when
 * `experimental.turbopackServeSourceContent` is enabled) set their `sourceRoot` to this value, so
 * DevTools fetches original file content lazily from `/__nextjs_source-content/[project]/<path>`.
 *
 * Keep in sync with the `sourceRoot` produced in `crates/next-core/src/util.rs`
 * (`SOURCE_CONTENT_ENDPOINT_PREFIX`).
 */
export const SOURCE_CONTENT_ENDPOINT_PREFIX =
  '/__nextjs_source-content/[project]/'

/**
 * Prefix of the virtual `turbopack://` URL used for `[project]`-scoped sources — first-party project
 * files as well as external packages whose own `.map` Turbopack composes into the graph. The
 * source-map consumer resolves such sources to `turbopack:///[project]/<project-relative-path>`.
 *
 * Like {@link SOURCE_CONTENT_ENDPOINT_PREFIX}, the stripped tail is **project-root-relative**, so the
 * two are treated identically for display (strip + rebase onto the project root, then relativize
 * against the cwd). This mirrors the native `traceSource` dispatch (`SOURCE_MAP_PREFIX_PROJECT` and
 * `SOURCE_CONTENT_SOURCE_ROOT` share the same rebase) in
 * `crates/next-napi-bindings/src/next_api/project.rs`.
 *
 * Keep in sync with `SOURCE_MAP_PREFIX_PROJECT` there (`turbopack:///[project]/`).
 */
export const SOURCE_MAP_PROJECT_PREFIX = 'turbopack:///[project]/'

function decodeSourcePath(rawSource: string): string {
  try {
    return decodeURIComponent(rawSource)
  } catch {
    // Malformed percent-encoding — fall back to the raw (still-stripped) form.
    return rawSource
  }
}

/**
 * Reverse the `sourceRoot` join that a source-map consumer applies in `originalPositionFor()`
 * (per the source-map spec, the returned `source` is `join(sourceRoot, rawSource)`), recovering
 * the raw `sources` entry for display. This matters for dev maps that set a `sourceRoot` — e.g.
 * `experimental.turbopackServeSourceContent`, whose maps point `sourceRoot` at the on-demand
 * content endpoint (`SOURCE_CONTENT_ENDPOINT_PREFIX`). The user-facing frame `file` should be the
 * clean project-relative path, not the endpoint URL.
 *
 * Strips either the passed map `sourceRoot` or, as a fallback, a known `[project]`-scoped prefix
 * (the on-demand content endpoint, or the virtual `turbopack:///[project]/`). The fallback is needed
 * because (a) sectioned (index) server maps apply a `sourceRoot` the consumer honors when resolving
 * `source`, but the applicable section payload we inspect does not expose the `sourceRoot` field, and
 * (b) external-package sources composed into the graph resolve to `turbopack:///[project]/…` with no
 * `sourceRoot` at all — so a strip keyed only on `sourceRoot` would miss both. The content-endpoint
 * prefix may be preceded by a `file://` scheme (the sync consumer resolves the source as a URL).
 *
 * The consumer's `computeSourceURL` runs the join through URL resolution when a `sourceRoot` is
 * present, which percent-encodes path segments (e.g. `[lang]` → `%5Blang%5D`). Decode the stripped
 * tail so bracketed dynamic-route segments render as authored. Returns `source` unchanged when
 * nothing applies.
 */
export function stripSourceRoot(
  source: string,
  sourceRoot: string | undefined | null
): string {
  // 1. Strip the map's own `sourceRoot` when present and matching (general correctness).
  if (sourceRoot && source.startsWith(sourceRoot)) {
    return decodeSourcePath(source.slice(sourceRoot.length))
  }

  // 2. Fall back to the known content-endpoint prefix, tolerating a leading `file://` scheme.
  const withoutScheme = source.startsWith('file://')
    ? source.slice('file://'.length)
    : source
  if (withoutScheme.startsWith(SOURCE_CONTENT_ENDPOINT_PREFIX)) {
    return decodeSourcePath(
      withoutScheme.slice(SOURCE_CONTENT_ENDPOINT_PREFIX.length)
    )
  }

  // 3. Fall back to the virtual `turbopack:///[project]/` prefix (external packages composed into
  //    the graph resolve here with no `sourceRoot`). Equivalent to the content-endpoint case above.
  if (source.startsWith(SOURCE_MAP_PROJECT_PREFIX)) {
    return decodeSourcePath(source.slice(SOURCE_MAP_PROJECT_PREFIX.length))
  }

  return source
}

/**
 * Returns true when the resolved `source` string is a `[project]`-scoped path whose
 * {@link stripSourceRoot} result is **project-root-relative** and must therefore be rebased onto the
 * project root before relativizing against the cwd for display. Two prefixes qualify (both map to the
 * project root):
 *
 * - the on-demand source-content endpoint ({@link SOURCE_CONTENT_ENDPOINT_PREFIX}, optionally
 *   `file://`-schemed) — first-party project sources when `turbopackServeSourceContent` is enabled;
 * - the virtual `turbopack:///[project]/` prefix ({@link SOURCE_MAP_PROJECT_PREFIX}) — external
 *   packages whose own `.map` is composed into the graph (these carry no `sourceRoot`).
 *
 * This mirrors the native `traceSource` dispatch, where `SOURCE_MAP_PREFIX_PROJECT` and
 * `SOURCE_CONTENT_SOURCE_ROOT` share the same `get_relative_path_to(cwd, project_root + source)`
 * rebase (`crates/next-napi-bindings/src/next_api/project.rs`). Without the rebase, a non-root
 * project (a monorepo app whose cwd is a subdirectory) would display project-root-relative paths
 * (`apps/web/app/x.ts`) instead of cwd-relative ones (`app/x.ts`).
 *
 * Keys strictly on the **resolved source prefix**, never the map's `sourceRoot`. A plain
 * `turbopack:///` source (no `[project]`) is *not* project-scoped and is left untouched — matching
 * the native `SOURCE_MAP_PREFIX` branch, which strips without rebasing.
 */
export function isProjectScopedSourcePath(source: string): boolean {
  const withoutScheme = source.startsWith('file://')
    ? source.slice('file://'.length)
    : source
  return (
    withoutScheme.startsWith(SOURCE_CONTENT_ENDPOINT_PREFIX) ||
    source.startsWith(SOURCE_MAP_PROJECT_PREFIX)
  )
}

/**
 * Reads a source file's content from disk given an absolute `file://` source URI. Dev server maps
 * use `file://` source URIs and omit inlined `sourcesContent` (with
 * `experimental.turbopackServeSourceContent`), so a consumer without a Turbopack handle — the sync
 * terminal/RSC stack renderer and the dev validation worker thread — recovers the content needed to
 * render a code frame by reading the file the URI points to. Returns null for non-`file://` sources
 * or any read error (missing/binary file), so callers fall back to a frame without a code frame.
 */
export function readSourceContentFromFileUri(source: string): string | null {
  // `nodeFs`/`nodeFileURLToPath` are undefined on edge (see their declarations); the guard keeps
  // TypeScript's narrowing honest and preserves the edge-returns-null behavior.
  if (
    process.env.NEXT_RUNTIME === 'edge' ||
    nodeFs === undefined ||
    nodeFileURLToPath === undefined ||
    !source.startsWith('file://')
  ) {
    return null
  }
  try {
    return nodeFs.readFileSync(nodeFileURLToPath(source), 'utf8')
  } catch {
    return null
  }
}

/**
 * The turbopack root the on-demand source-content endpoint maps to
 * (`project_root_path()` in `crates/next-napi-bindings/src/next_api/project.rs`, i.e. the turbopack
 * root — the monorepo root in a non-root project, not the app dir). Used to rebase the
 * `sourceRoot`-stripped (project-root-relative) path onto an absolute path before relativizing it
 * against the cwd for display.
 *
 * Stored on `globalThis` (not module state) because `patch-error-inspect.ts` — the consumer that
 * symbolicates Server Component frames — is bundled into multiple runtimes (dev server, app-page
 * runtime bundle, dev worker bundles), each with its own module copy. `Error.prepareStackTrace` is
 * process-global, so the copy that symbolicates a frame is not necessarily the one where the value
 * was set; a shared `globalThis` slot lets any copy read it. Mirrors the `CODE_FRAME_RENDERER` /
 * `BUNDLER_FIND_SOURCE_MAP` symbol pattern in this file's callers.
 */
const PROJECT_ROOT_FOR_DISPLAY = Symbol.for(
  'next.dev.projectRootForErrorDisplay'
)
type GlobalWithProjectRoot = typeof globalThis & {
  [PROJECT_ROOT_FOR_DISPLAY]?: string
}

export function setProjectRootForErrorDisplay(projectRoot: string): void {
  ;(globalThis as GlobalWithProjectRoot)[PROJECT_ROOT_FOR_DISPLAY] = projectRoot
}

/**
 * Resolve the user-facing display path for a `sourceRoot`-stripped source.
 *
 * `rawSource` is the result of {@link stripSourceRoot}. When the resolved `source` is
 * {@link isProjectScopedSourcePath project-scoped} (the on-demand content endpoint, or the virtual
 * `turbopack:///[project]/` prefix), `rawSource` is **project-root-relative**, so it must be joined
 * onto the turbopack root ({@link setProjectRootForErrorDisplay}) and relativized against the cwd —
 * mirroring the native `traceSource` (`get_relative_path_to(cwd, project_root + source)`). Otherwise
 * `rawSource` is returned unchanged, keeping the flag-off path byte-identical. When the project root
 * has not been set (e.g. non-dev callers) the raw path is returned as a safe fallback.
 */
export function resolveProjectScopedDisplayPath(
  rawSource: string,
  source: string
): string {
  const projectRoot = (globalThis as GlobalWithProjectRoot)[
    PROJECT_ROOT_FOR_DISPLAY
  ]
  // `nodePath` is undefined on edge (see its declaration). The project root is never set on edge,
  // so this branch is unreachable there; the guard keeps TypeScript's narrowing honest.
  if (
    projectRoot === undefined ||
    nodePath === undefined ||
    !isProjectScopedSourcePath(source)
  ) {
    return rawSource
  }
  return nodePath.relative(process.cwd(), nodePath.join(projectRoot, rawSource))
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
