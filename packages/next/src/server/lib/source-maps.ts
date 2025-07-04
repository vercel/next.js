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
interface BasicSourceMapPayload {
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

// TODO: This should take the BasicSourceMapPayload. Only the relevant section
// needs to ignore list everything making this check effectively O(1) multiplied
// by the complexity of finding the section.
export function sourceMapIgnoreListsEverything(
  sourceMap: ModernSourceMapPayload
): boolean {
  if ('sections' in sourceMap) {
    return sourceMap.sections.every((section) => {
      return sourceMapIgnoreListsEverything(section.map)
    })
  }
  return (
    sourceMap.ignoreList !== undefined &&
    sourceMap.sources.length === sourceMap.ignoreList.length
  )
}

/**
 * Finds the sourcemap payload applicable to a given frame.
 * Equal to the input unless an Index Source Map is used.
 */
export function findApplicableSourceMapPayload(
  lineNumber: number,
  columnNumber: number,
  payload: ModernSourceMapPayload
): BasicSourceMapPayload | undefined {
  if ('sections' in payload) {
    // Sections must not overlap and must be sorted: https://tc39.es/source-map/#section-object
    // Therefore the last section that has an offset less than or equal to the frame is the applicable one.
    // TODO(veil): Binary search
    let section: IndexSourceMapSection | undefined = payload.sections[0]
    for (
      let i = 0;
      i < payload.sections.length &&
      payload.sections[i].offset.line <= lineNumber &&
      payload.sections[i].offset.column <= columnNumber;
      i++
    ) {
      section = payload.sections[i]
    }

    return section === undefined ? undefined : section.map
  } else {
    return payload
  }
}
