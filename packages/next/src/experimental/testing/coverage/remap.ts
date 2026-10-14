import type { CompiledTestArtifact } from '../contracts'
import { coverageHash, readArtifactFile } from './artifact'
import { decodeCoverageMap } from './maps'
import type {
  CoverageArtifactMetadata,
  CoverageCapture,
  CoverageRange,
  FileCoverage,
  SourceLineCoverage,
} from './types'

function starts(text: string): number[] {
  const result = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') result.push(i + 1)
  return result
}

function offset(
  lines: number[],
  text: string,
  line: number,
  column: number
): number {
  const start = lines[line - 1]
  const end = lines[line] === undefined ? text.length : lines[line] - 1
  if (start === undefined || column < 0 || start + column > end) {
    throw new Error('Coverage mapping coordinate exceeds source content')
  }
  return start + column
}

function validateRanges(
  capture: CoverageCapture['scripts'][number],
  length: number
): CoverageRange[] {
  const ranges: CoverageRange[] = []
  for (const fn of capture.functions) {
    if (
      !Array.isArray(fn.ranges) ||
      !fn.ranges.length ||
      typeof fn.isBlockCoverage !== 'boolean'
    ) {
      throw new Error('Missing V8 function coverage ranges')
    }
    const root = fn.ranges[0]
    if (!fn.isBlockCoverage && root.count !== 0) {
      throw new Error(
        'V8 returned function-only coverage for an executed function'
      )
    }
    const parents: CoverageRange[] = []
    let previousStart = -1
    for (const range of fn.ranges) {
      if (
        ![range.startOffset, range.endOffset, range.count].every(
          Number.isSafeInteger
        ) ||
        range.startOffset < 0 ||
        range.endOffset <= range.startOffset ||
        range.endOffset > length ||
        range.count < 0 ||
        range.startOffset < root.startOffset ||
        range.endOffset > root.endOffset
      ) {
        throw new Error('Invalid V8 coverage range')
      }
      if (range.startOffset < previousStart)
        throw new Error('Unordered V8 coverage ranges')
      previousStart = range.startOffset
      while (
        parents.length &&
        range.startOffset >= parents[parents.length - 1].endOffset
      )
        parents.pop()
      if (
        parents.length &&
        range.endOffset > parents[parents.length - 1].endOffset
      ) {
        throw new Error('Crossing V8 coverage ranges')
      }
      parents.push(range)
      ranges.push(range)
    }
  }
  if (!ranges.length) throw new Error('Missing V8 script coverage ranges')
  return ranges
}

/** A line is covered if one mapped, non-whitespace generated span executes. */
function executes(
  text: string,
  start: number,
  end: number,
  ranges: CoverageRange[]
): boolean {
  const boundaries = new Set([start, end])
  for (const range of ranges) {
    if (range.startOffset > start && range.startOffset < end)
      boundaries.add(range.startOffset)
    if (range.endOffset > start && range.endOffset < end)
      boundaries.add(range.endOffset)
  }
  const sorted = [...boundaries].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length - 1; i++) {
    const left = sorted[i]
    const right = sorted[i + 1]
    if (!text.slice(left, right).trim()) continue
    let owner: CoverageRange | undefined
    for (const range of ranges) {
      if (
        range.startOffset <= left &&
        range.endOffset >= right &&
        (!owner ||
          range.endOffset - range.startOffset <
            owner.endOffset - owner.startOffset ||
          (range.endOffset - range.startOffset ===
            owner.endOffset - owner.startOffset &&
            range.count < owner.count))
      ) {
        owner = range
      }
    }
    if (!owner)
      throw new Error('Mapped generated code has no V8 coverage range')
    if (owner.count > 0) return true
  }
  return false
}

/** Resolve only while the compiler artifact lease is retained. No source writes. */
export async function remapCoverage(
  artifact: CompiledTestArtifact & { coverage?: CoverageArtifactMetadata },
  capture: CoverageCapture
): Promise<FileCoverage> {
  if (
    capture.version !== 1 ||
    artifact.coverage?.version !== 1 ||
    artifact.moduleMocking ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.mode !== 'development'
  ) {
    throw new Error('Unsupported coverage capture or artifact')
  }
  const metadata = artifact.coverage
  const files = new Map<
    string,
    {
      source: SourceLineCoverage
      executable: Set<number>
      covered: Set<number>
    }
  >()
  const seen = new Set<string>()
  for (const script of capture.scripts) {
    const declared = metadata.scripts.find((item) => item.path === script.path)
    if (
      !declared ||
      seen.has(script.path) ||
      script.sha256 !== declared.sha256 ||
      !declared.mapPath ||
      !declared.mapSha256
    ) {
      throw new Error(
        `Missing, duplicate or unmapped coverage script: ${script.path}`
      )
    }
    seen.add(script.path)
    const [bytes, mapBytes] = await Promise.all([
      readArtifactFile(artifact.rootDir, script.path),
      readArtifactFile(artifact.rootDir, declared.mapPath),
    ])
    if (
      coverageHash(bytes) !== declared.sha256 ||
      coverageHash(mapBytes) !== declared.mapSha256
    ) {
      throw new Error(
        `Coverage artifact changed before remapping: ${script.path}`
      )
    }
    const generated = bytes.toString('utf8')
    const generatedLines = starts(generated)
    const ranges = validateRanges(script, generated.length)
    const map = decodeCoverageMap(JSON.parse(mapBytes.toString('utf8')))
    const originalLines = new Map<string, number[]>()
    for (let i = 0; i < map.mappings.length; i++) {
      const mapping = map.mappings[i]
      const begin = offset(
        generatedLines,
        generated,
        mapping.generatedLine,
        mapping.generatedColumn
      )
      const next = map.mappings[i + 1]
      const end =
        next?.generatedLine === mapping.generatedLine
          ? offset(
              generatedLines,
              generated,
              next.generatedLine,
              next.generatedColumn
            )
          : (generatedLines[mapping.generatedLine] ?? generated.length)
      if (end < begin) throw new Error('Unordered coverage mappings')
      if (mapping.source === null) continue
      if (!Object.hasOwn(metadata.sources, mapping.source))
        throw new Error(`Unknown coverage source: ${mapping.source}`)
      const source = metadata.sources[mapping.source]
      if (source === null) continue
      const content = map.sources.get(mapping.source)
      if (
        typeof content !== 'string' ||
        coverageHash(content) !== source.sha256
      ) {
        throw new Error(`Coverage original source changed: ${mapping.source}`)
      }
      let lines = originalLines.get(mapping.source)
      if (!lines) originalLines.set(mapping.source, (lines = starts(content)))
      offset(lines, content, mapping.originalLine!, mapping.originalColumn!)
      if (end === begin || !generated.slice(begin, end).trim()) continue
      let record = files.get(source.file)
      if (!record) {
        record = {
          source: { ...source, executableLines: [], coveredLines: [] },
          executable: new Set(),
          covered: new Set(),
        }
        files.set(source.file, record)
      } else if (record.source.sha256 !== source.sha256)
        throw new Error(`Conflicting original coverage source: ${source.file}`)
      record.executable.add(mapping.originalLine!)
      if (executes(generated, begin, end, ranges))
        record.covered.add(mapping.originalLine!)
    }
  }
  if (!seen.has(artifact.entryPath))
    throw new Error('Coverage capture is missing the entry script')
  return {
    version: 1,
    entryId: artifact.entryId,
    revision: artifact.revision,
    complete: true,
    errors: [],
    files: [...files.values()]
      .map(({ source, executable, covered }) => ({
        ...source,
        executableLines: [...executable].sort((a, b) => a - b),
        coveredLines: [...covered].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.file.localeCompare(b.file)),
  }
}
