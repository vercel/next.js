import fs from 'fs/promises'
import dataUriToBuffer from 'next/dist/compiled/data-uri-to-buffer'
import { getSourceMapUrl } from './get-source-map-url'
import type { RawSourceMap } from 'next/dist/compiled/source-map08'
import path from 'path'

export async function getRawSourceMap(
  filename: string,
  fileContents: string
): Promise<RawSourceMap | undefined> {
  const sourceUrl = getSourceMapUrl(fileContents)

  if (!sourceUrl) {
    return undefined
  }

  if (sourceUrl.startsWith('data:')) {
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

  const sourceMapFilename = path.resolve(path.dirname(filename), sourceUrl)

  try {
    const sourceMapContents = await fs.readFile(sourceMapFilename, 'utf-8')

    return JSON.parse(sourceMapContents.toString())
  } catch {
    console.error('Failed to parse source map.')
    return undefined
  }
}
