import { nextTestSetup } from 'e2e-utils'
import { promises as fs } from 'fs'
import path from 'path'

describe('turbopack invalid source map', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'simple-peer': '9.11.1',
    },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('does not emit huge VLQ column deltas for minified vendor sources', async () => {
    if (!isNextDev || !isTurbopack) {
      return
    }

    const html = await (await next.fetch('/')).text()
    expect(html).toMatch(/SimplePeer:.*function/s)

    const chunksDir = path.join(next.testDir, '.next/dev/static/chunks')
    const mapFiles = (await listFiles(chunksDir)).filter((file) =>
      file.endsWith('.js.map')
    )
    const failures: string[] = []

    for (const file of mapFiles) {
      const map = JSON.parse(await fs.readFile(file, 'utf8'))
      for (const section of sourceMapSections(map)) {
        if (
          !section.sources?.some((source) =>
            source.includes('simplepeer.min.js')
          )
        ) {
          continue
        }

        failures.push(...findInvalidSourceMapSegments(file, section))
      }
    }

    expect(failures).toEqual([])
  })
})

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const fullPath = path.join(dir, entry.name)
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath]
    })
  )
  return files.flat()
}

function sourceMapSections(map: any): any[] {
  if (Array.isArray(map.sections)) {
    return map.sections.flatMap((section: any) =>
      sourceMapSections(section.map)
    )
  }
  return [map]
}

function findInvalidSourceMapSegments(file: string, map: any): string[] {
  const failures: string[] = []
  const lineLengthsBySource = new Map<number, number[]>()
  const state = {
    sourceIndex: 0,
    sourceLine: 0,
    sourceColumn: 0,
    nameIndex: 0,
  }

  for (const [generatedLine, line] of (map.mappings || '')
    .split(';')
    .entries()) {
    let generatedColumn = 0
    for (const segment of line.split(',')) {
      if (!segment) {
        continue
      }

      const values = decodeVlqSegment(segment)
      if (values.some((value) => Math.abs(value) > 1_000_000)) {
        failures.push(`${file}:${generatedLine}:${generatedColumn} ${segment}`)
      }

      generatedColumn += values[0]
      if (values.length <= 1) {
        continue
      }

      state.sourceIndex += values[1]
      state.sourceLine += values[2]
      state.sourceColumn += values[3]
      if (values.length > 4) {
        state.nameIndex += values[4]
      }

      const lineLengths = getSourceLineLengths(
        map,
        state.sourceIndex,
        lineLengthsBySource
      )
      if (
        state.sourceLine < 0 ||
        state.sourceLine >= lineLengths.length ||
        state.sourceColumn < 0 ||
        state.sourceColumn > lineLengths[state.sourceLine]
      ) {
        failures.push(
          `${file}:${generatedLine}:${generatedColumn} ${segment} -> ${JSON.stringify(
            state
          )}`
        )
      }
    }
  }

  return failures
}

function getSourceLineLengths(
  map: any,
  sourceIndex: number,
  cache: Map<number, number[]>
) {
  if (!cache.has(sourceIndex)) {
    cache.set(
      sourceIndex,
      (map.sourcesContent?.[sourceIndex] ?? '')
        .split('\n')
        .map((line: string) => line.length)
    )
  }
  return cache.get(sourceIndex)!
}

const VLQ_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function decodeVlqSegment(segment: string) {
  const values: number[] = []
  let current = 0
  let shift = 0

  for (const char of segment) {
    const encoded = VLQ_CHARS.indexOf(char)
    const digit = encoded & 31
    const continuation = encoded >> 5
    current += digit * 2 ** shift
    shift += 5

    if (continuation === 0) {
      const negative = current & 1
      current = Math.floor(current / 2)
      values.push(negative ? -current : current)
      current = 0
      shift = 0
    }
  }

  return values
}
