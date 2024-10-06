import dataUriToBuffer from 'next/dist/compiled/data-uri-to-buffer'
import { getSourceMapUrl } from './get-source-map-url'
import type { RawSourceMap } from 'next/dist/compiled/source-map08'

export function getRawSourceMap(
  fileContents: string
): RawSourceMap | undefined {
  const sourceUrl = getSourceMapUrl(fileContents)

  if (!sourceUrl?.startsWith('data:')) {
    return undefined
  }

  let buffer

  try {
    buffer = dataUriToBuffer(sourceUrl)
  } catch (err) {
    console.error('Failed to parse source map URL:', err)
    return undefined
  }

  if (buffer.type !== 'application/json') {
    console.error(`Unknown source map type: ${buffer.typeFull}.`)
    return undefined
  }

  try {
    return JSON.parse(buffer.toString())
  } catch {
    console.error('Failed to parse source map.')
    return undefined
  }
}
