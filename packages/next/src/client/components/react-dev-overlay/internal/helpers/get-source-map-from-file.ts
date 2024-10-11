import fs from 'fs/promises'
import path from 'path'
import type { RawSourceMap } from 'next/dist/compiled/source-map08'
import dataUriToBuffer from 'next/dist/compiled/data-uri-to-buffer'
import { getSourceMapUrl } from './get-source-map-url'

export async function getSourceMapFromFile(
  filename: string
): Promise<RawSourceMap | undefined> {
  let fileContents: string

  try {
    fileContents = await fs.readFile(filename, 'utf-8')
  } catch (error) {
    throw new Error('Failed to read file contents.', { cause: error })
  }

  const sourceUrl = getSourceMapUrl(fileContents)

  if (!sourceUrl) {
    return undefined
  }

  if (sourceUrl.startsWith('data:')) {
    let buffer: dataUriToBuffer.MimeBuffer

    try {
      buffer = dataUriToBuffer(sourceUrl)
    } catch (error) {
      throw new Error('Failed to parse source map URL.', { cause: error })
    }

    if (buffer.type !== 'application/json') {
      throw new Error(`Unknown source map type: ${buffer.typeFull}.`)
    }

    try {
      return JSON.parse(buffer.toString())
    } catch (error) {
      throw new Error('Failed to parse source map.', { cause: error })
    }
  }

  const sourceMapFilename = path.resolve(path.dirname(filename), sourceUrl)

  try {
    const sourceMapContents = await fs.readFile(sourceMapFilename, 'utf-8')

    return JSON.parse(sourceMapContents.toString())
  } catch (error) {
    throw new Error('Failed to parse source map.', { cause: error })
  }
}
