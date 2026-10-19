import {
  SourceMapConsumer,
  type RawSourceMap,
} from 'next/dist/compiled/source-map'
import type { ClientConfiguration } from './protocol'

type Frame = { file: string; line: number; column: number; method?: string }
/** No source-path guesses: the parent binds map sources to exact selected bytes. */
export function createClientSourceMapResolver(
  config: Pick<ClientConfiguration, 'filePath' | 'sourceMaps'>
) {
  const maps = new Map(
    config.sourceMaps.map((record) => [
      record.url,
      {
        consumer: new SourceMapConsumer(record.map as RawSourceMap),
        selected: new Set(record.originalSources),
      },
    ])
  )
  function resolveLocation(frame: Frame) {
    // The pinned browser stack parser removes the origin from same-page URLs.
    // Accept only that exact compiler-issued pathname or its absolute URL.
    const base = config.sourceMaps[0]?.url
    const url =
      frame.file.startsWith('/') && !frame.file.startsWith('//') && base
        ? new URL(frame.file, base)
        : new URL(frame.file)
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
    const mapped = record.consumer.originalPositionFor({
      line: frame.line,
      column: frame.column - 1,
    })
    if (
      !mapped.source ||
      !record.selected.has(mapped.source) ||
      !mapped.line ||
      mapped.column === null
    )
      throw new Error(
        'Browser inline snapshot frame is not bound to the selected source bytes.'
      )
    return {
      record,
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
      const { record, source } = resolveLocation(frame)
      return record.consumer.sourceContentFor(source, true)
    },
  }
}
