import { encode, encodeRangeMappings } from '@jridgewell/sourcemap-codec'
import { MagicStringError } from './MagicStringError'

type Btoa = (str: string) => string

interface GlobalBuffer {
  from: (
    str: string,
    encoding: 'utf-8'
  ) => {
    toString: (encoding: 'base64') => string
  }
}

export interface SourceMapOptions {
  /**
   * Whether the mapping should be high-resolution:
   * - `false` (default) - lo-res mappings. Only one mapping per line, plus any locations added
   *   with `s.addSourcemapLocation()`. Quicker to generate and less bulky, but devtools may only
   *   be able to identify the correct line, not the exact column.
   * - `true` - hi-res mappings. Every single character gets a mapping, so devtools can always
   *   pinpoint the exact location of function calls and so on.
   * - `"boundary"` - semi-hi-res mappings, segmented per word boundary instead of per character.
   *   Suitable for string semantics that are separated by words.
   * - `"experimental-range"` - hi-res mappings that use range mappings
   *   (https://github.com/tc39/ecma426/blob/main/proposals/range-mappings.md), a source map
   *   extension that can map all positions in a range with fewer mappings than mapping every
   *   character individually. This requires support for range mappings in the source map
   *   consumer, and the feature is experimental.
   *
   * If sourcemap locations have been specified with s.addSourceMapLocation(), they will be used here.
   */
  hires?: boolean | 'boundary' | 'experimental-range'
  /**
   * The filename where you plan to write the sourcemap.
   */
  file?: string
  /**
   * The filename of the file containing the original source.
   */
  source?: string
  /**
   * Whether to include the original content in the map's sourcesContent array.
   */
  includeContent?: boolean
}

export type SourceMapSegment =
  | [number]
  | [number, number, number, number]
  | [number, number, number, number, number]

export type SourceMapRangeMappings = number[][]

export interface DecodedSourceMap {
  file?: string
  sources: string[]
  sourcesContent?: Array<string | null>
  names: string[]
  mappings: SourceMapSegment[][]
  x_google_ignoreList?: number[]
  debugId?: string
  rangeMappings?: SourceMapRangeMappings
}

function getBtoa(): Btoa {
  /* v8 ignore next -- environment fallback, unreachable when `btoa` is present */
  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.btoa === 'function'
  ) {
    return (str) => globalThis.btoa(unescape(encodeURIComponent(str)))
  }

  /* v8 ignore start -- environment fallback, unreachable when `btoa` is present */
  const bufferKey = 'Buffer'
  const buffer = (
    globalThis as typeof globalThis & Record<string, GlobalBuffer | undefined>
  )[bufferKey]
  if (buffer) {
    return (str) => buffer.from(str, 'utf-8').toString('base64')
  }

  return () => {
    throw new MagicStringError(
      'unsupported environment: `btoa` or `Buffer` is required'
    )
  }
  /* v8 ignore stop */
}

const btoa = /* #__PURE__ */ getBtoa()

export class SourceMap {
  declare version: number
  declare file: string | undefined
  declare sources: string[]
  declare sourcesContent: Array<string | null> | undefined
  declare names: string[]
  declare mappings: string
  declare x_google_ignoreList: number[] | undefined
  declare debugId: string | undefined
  declare rangeMappings: string | undefined

  constructor(
    properties:
      | DecodedSourceMap
      | (Omit<DecodedSourceMap, 'mappings'> & { mappings: string })
  ) {
    this.version = 3
    this.file = properties.file
    this.sources = properties.sources
    this.sourcesContent = properties.sourcesContent
    this.names = properties.names
    this.mappings =
      typeof properties.mappings === 'string'
        ? properties.mappings
        : encode(properties.mappings)
    if (typeof properties.x_google_ignoreList !== 'undefined') {
      this.x_google_ignoreList = properties.x_google_ignoreList
    }
    if (typeof properties.debugId !== 'undefined') {
      this.debugId = properties.debugId
    }
    if (typeof properties.rangeMappings !== 'undefined') {
      let shouldOutputRangeMapping = false
      for (const line of properties.rangeMappings) {
        if (line.length !== 0) {
          shouldOutputRangeMapping = true
          break
        }
      }
      if (shouldOutputRangeMapping) {
        this.rangeMappings = encodeRangeMappings(properties.rangeMappings)
      }
    }
  }

  /**
   * Returns the equivalent of `JSON.stringify(map)`
   */
  toString(): string {
    return JSON.stringify(this)
  }

  /**
   * Returns a DataURI containing the sourcemap. Useful for doing this sort of thing:
   * `generateMap(options?: SourceMapOptions): SourceMap;`
   */
  toUrl(): string {
    return `data:application/json;charset=utf-8;base64,${btoa(this.toString())}`
  }
}
