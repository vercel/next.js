import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { ClientConfiguration } from './protocol'

type Frame = { file: string; line: number; column: number; method?: string }
type SourceMapNode =
  | { consumer: SourceMapConsumer }
  | {
      sections: {
        offset: { line: number; column: number }
        map: SourceMapNode
      }[]
    }

function readMap(rawMap: RawSourceMap): SourceMapNode {
  function visit(
    map: RawSourceMap,
    flatConsumer?: SourceMapConsumer
  ): SourceMapNode {
    const sections = (
      map as RawSourceMap & {
        sections?: {
          offset: { line: number; column: number }
          map: RawSourceMap
        }[]
      }
    ).sections
    if (sections)
      return {
        sections: sections.map((section) => ({
          offset: section.offset,
          map: visit(section.map),
        })),
      }
    return { consumer: flatConsumer ?? new SourceMapConsumer(map) }
  }
  // Keep validation of every actual nested map and its original section order.
  return visit(rawMap, new SourceMapConsumer(rawMap))
}

function originalPosition(
  node: SourceMapNode,
  line: number,
  column: number
):
  | {
      consumer: SourceMapConsumer
      mapped: ReturnType<SourceMapConsumer['originalPositionFor']>
    }
  | undefined {
  if ('consumer' in node)
    return {
      consumer: node.consumer,
      mapped: node.consumer.originalPositionFor({ line: line + 1, column }),
    }
  for (let index = node.sections.length - 1; index >= 0; index--) {
    const section = node.sections[index]
    if (
      section.offset.line < line ||
      (section.offset.line === line && section.offset.column <= column)
    ) {
      // Section offsets are zero-based. Only the first relative line carries
      // the section's column; an empty or unmapped child owns its whole scope.
      return originalPosition(
        section.map,
        line - section.offset.line,
        line === section.offset.line ? column - section.offset.column : column
      )
    }
  }
}
/** No source-path guesses: the parent binds map sources to exact selected bytes. */
export function createClientSourceMapResolver(
  config: Pick<ClientConfiguration, 'filePath' | 'sourceMaps'>
) {
  const maps = new Map(
    config.sourceMaps.map((record) => [
      record.url,
      {
        map: readMap(record.map as RawSourceMap),
        selected: new Set(record.originalSources),
      },
    ])
  )
  function resolveLocation(frame: Frame) {
    // The pinned browser stack parser removes the origin from same-page URLs.
    // Accept only that exact compiler-issued pathname or its absolute URL.
    // Gecko identifies an evaluated chunk by its source filename plus the
    // outer script location. The frame coordinates still belong to the chunk.
    const file = frame.file.replace(/ line [1-9]\d* > srcScript$/, '')
    const base = config.sourceMaps[0]?.url
    const url =
      file.startsWith('/') && !file.startsWith('//') && base
        ? new URL(file, base)
        : new URL(file)
    url.search = ''
    url.hash = ''
    const record = maps.get(url.href)
    if (
      !record ||
      !Number.isSafeInteger(frame.line) ||
      frame.line < 1 ||
      !Number.isSafeInteger(frame.column) ||
      frame.column < 1
    )
      throw new Error(
        'Inline snapshots require an original source location from the compiled browser artifact.'
      )
    const position = originalPosition(
      record.map,
      frame.line - 1,
      frame.column - 1
    )
    const mapped = position?.mapped
    if (
      !position ||
      !mapped?.source ||
      !record.selected.has(mapped.source) ||
      !mapped.line ||
      mapped.column === null
    )
      throw new Error(
        'Browser inline snapshot frame is not bound to the selected source bytes.'
      )
    return {
      consumer: position.consumer,
      source: mapped.source,
      location: {
        file: config.filePath,
        line: mapped.line,
        column: mapped.column + 1,
        method: mapped.name ?? frame.method,
      },
    }
  }
  return {
    mapLocation(frame: Frame): Frame {
      return resolveLocation(frame).location
    },
    getSourceContent(frame: Frame): string | null {
      const { consumer, source } = resolveLocation(frame)
      return consumer.sourceContentFor(source, true)
    },
  }
}
