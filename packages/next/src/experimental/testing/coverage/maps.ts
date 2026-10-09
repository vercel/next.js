import { SourceMapConsumer } from 'next/dist/compiled/source-map'

export interface CoverageMapping {
  generatedLine: number
  generatedColumn: number
  source: string | null
  originalLine: number | null
  originalColumn: number | null
}

export interface DecodedCoverageMap {
  mappings: CoverageMapping[]
  sources: Map<string, string | null>
}

function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

/** Decode ranges' boundaries, including unmapped segments and section boundaries. */
export function decodeCoverageMap(input: unknown): DecodedCoverageMap {
  const mappings: CoverageMapping[] = []
  const sources = new Map<string, string | null>()
  function visit(map: any, line: number, column: number, depth: number) {
    if (!map || map.version !== 3 || depth > 32) {
      throw new Error('Invalid coverage source map version or nesting')
    }
    if (Array.isArray(map.sections)) {
      // Next emits an empty sources array on index maps for Node compatibility.
      if (
        'mappings' in map ||
        ('sources' in map &&
          (!Array.isArray(map.sources) || map.sources.length !== 0)) ||
        ('sourcesContent' in map &&
          (!Array.isArray(map.sourcesContent) ||
            map.sourcesContent.length !== 0))
      ) {
        throw new Error('Mixed indexed and flat coverage source map')
      }
      let previousLine = -1
      let previousColumn = -1
      let lastSectionMapping: CoverageMapping | undefined
      for (const section of map.sections) {
        const offset = section?.offset
        if (
          !offset ||
          !integer(offset.line) ||
          !integer(offset.column) ||
          offset.line < previousLine ||
          (offset.line === previousLine && offset.column <= previousColumn) ||
          !section.map ||
          section.url
        )
          throw new Error('Invalid coverage source map section')
        const sectionLine = line + offset.line
        const sectionColumn = offset.column + (offset.line === 0 ? column : 0)
        const last = lastSectionMapping
        if (
          last &&
          (last.generatedLine > sectionLine + 1 ||
            (last.generatedLine === sectionLine + 1 &&
              last.generatedColumn >= sectionColumn))
        ) {
          throw new Error('Overlapping coverage source map sections')
        }
        mappings.push({
          generatedLine: sectionLine + 1,
          generatedColumn: sectionColumn,
          source: null,
          originalLine: null,
          originalColumn: null,
        })
        visit(section.map, sectionLine, sectionColumn, depth + 1)
        lastSectionMapping = mappings[mappings.length - 1]
        previousLine = offset.line
        previousColumn = offset.column
      }
      return
    }
    // Next's explicit unmapped-section sentinel has no sourcesContent field.
    const sourceContents =
      map.sourcesContent === undefined &&
      Array.isArray(map.sources) &&
      map.sources.length === 0
        ? []
        : map.sourcesContent
    if (
      typeof map.mappings !== 'string' ||
      !Array.isArray(map.sources) ||
      !map.sources.every((source: unknown) => typeof source === 'string') ||
      !Array.isArray(sourceContents) ||
      sourceContents.length !== map.sources.length ||
      !sourceContents.every(
        (content: unknown) => content === null || typeof content === 'string'
      ) ||
      !Array.isArray(map.names) ||
      !map.names.every((name: unknown) => typeof name === 'string') ||
      (map.sourceRoot !== undefined && typeof map.sourceRoot !== 'string')
    ) {
      throw new Error('Invalid coverage source map sources or content')
    }
    const consumer = new SourceMapConsumer(map)
    // source-map 0.6 exposes normalized sources in original index order.
    // sourceContentFor(name) would hide conflicting duplicate source indices.
    const normalized = (consumer as SourceMapConsumer & { sources: string[] })
      .sources
    if (normalized.length !== map.sources.length)
      throw new Error('Coverage source index mismatch')
    for (let index = 0; index < normalized.length; index++) {
      const source = normalized[index]
      const content = sourceContents[index]
      if (sources.has(source) && sources.get(source) !== content) {
        throw new Error(`Conflicting coverage source content: ${source}`)
      }
      sources.set(source, content)
    }
    consumer.eachMapping((mapping: CoverageMapping) => {
      // source-map 0.6 normalizes the absent source of generated-only segments
      // to "." (or sourceRoot). Their null original coordinates are authoritative.
      const source =
        mapping.originalLine === null && mapping.originalColumn === null
          ? null
          : mapping.source
      if (
        !integer(mapping.generatedLine) ||
        mapping.generatedLine === 0 ||
        !integer(mapping.generatedColumn) ||
        (source !== null &&
          (!sources.has(source) ||
            !integer(mapping.originalLine) ||
            mapping.originalLine === 0 ||
            !integer(mapping.originalColumn)))
      ) {
        throw new Error('Invalid coverage source map coordinate')
      }
      mappings.push({
        ...mapping,
        source,
        generatedLine: mapping.generatedLine + line,
        generatedColumn:
          mapping.generatedColumn + (mapping.generatedLine === 1 ? column : 0),
      })
    })
  }
  visit(input, 0, 0, 0)
  return { mappings, sources }
}
