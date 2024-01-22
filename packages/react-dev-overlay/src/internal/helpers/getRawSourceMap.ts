// @ts-ignore Package Exists
import dataUriToBuffer from 'next/dist/compiled/data-uri-to-buffer'
import { getSourceMapUrl } from './getSourceMapUrl'

export function getRawSourceMap(fileContents: string): unknown | null {
  const sourceUrl = getSourceMapUrl(fileContents)
  if (!sourceUrl?.startsWith('data:')) {
    return null
  }

  let buffer
  try {
    buffer = dataUriToBuffer(sourceUrl)
  } catch (err) {
    console.error('Failed to parse source map URL:', err)
    return null
  }

  if (buffer.type !== 'application/json') {
    console.error(`Unknown source map type: ${buffer.typeFull}.`)
    return null
  }

  try {
    return JSON.parse(buffer.toString())
  } catch {
    console.error('Failed to parse source map.')
    return null
  }
}
