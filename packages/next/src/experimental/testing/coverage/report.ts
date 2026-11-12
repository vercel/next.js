import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { join, resolve } from 'path'
import type { CoverageReport, FileCoverage, SourceLineCoverage } from './types'

/** One whole-file interval includes every retry; files merge by original hash. */
export function createCoverageReport(expectedEntryIds: readonly string[]) {
  const expected = new Set(expectedEntryIds)
  if (expected.size !== expectedEntryIds.length)
    throw new Error('Duplicate expected coverage entry')
  const received = new Map<string, FileCoverage>()
  const errors: string[] = []
  return {
    add(file: FileCoverage) {
      if (
        !expected.has(file.entryId) ||
        received.has(file.entryId) ||
        file.version !== 1
      ) {
        throw new Error(
          `Unexpected or duplicate coverage entry: ${file.entryId}`
        )
      }
      received.set(file.entryId, structuredClone(file))
    },
    incomplete(entryId: string, message: string) {
      errors.push(`${entryId}: ${message}`)
    },
    finish(): CoverageReport {
      const failures = [...errors]
      const files = new Map<string, SourceLineCoverage>()
      for (const entryId of expected) {
        const result = received.get(entryId)
        if (!result) {
          failures.push(`Missing coverage capture: ${entryId}`)
          continue
        }
        if (!result.complete || result.errors.length)
          failures.push(
            ...result.errors,
            ...(!result.complete ? [`Incomplete coverage: ${entryId}`] : [])
          )
        for (const source of result.files) {
          if (
            ![...source.executableLines, ...source.coveredLines].every(
              (line) => Number.isSafeInteger(line) && line > 0
            ) ||
            source.coveredLines.some(
              (line) => !source.executableLines.includes(line)
            )
          ) {
            failures.push(`Invalid coverage line sets: ${source.file}`)
            continue
          }
          const previous = files.get(source.file)
          if (previous && previous.sha256 !== source.sha256) {
            failures.push(
              `Source changed between coverage entries: ${source.file}`
            )
            continue
          }
          files.set(source.file, {
            ...source,
            executableLines: [
              ...new Set([
                ...(previous?.executableLines ?? []),
                ...source.executableLines,
              ]),
            ].sort((a, b) => a - b),
            coveredLines: [
              ...new Set([
                ...(previous?.coveredLines ?? []),
                ...source.coveredLines,
              ]),
            ].sort((a, b) => a - b),
          })
        }
      }
      const output = [...files.values()].sort((a, b) =>
        a.file.localeCompare(b.file)
      )
      const executable = output.reduce(
        (sum, file) => sum + file.executableLines.length,
        0
      )
      const covered = output.reduce(
        (sum, file) => sum + file.coveredLines.length,
        0
      )
      return {
        version: 1,
        kind: 'node-line',
        complete: !failures.length,
        errors: failures,
        entries: [...expected].sort(),
        files: output,
        totals: {
          executable,
          covered,
          percent:
            failures.length || !executable
              ? null
              : (covered / executable) * 100,
        },
      }
    },
  }
}

/** Unique retained directory, independent of artifact disposal and source trees. */
export async function writeCoverageReport(
  report: CoverageReport,
  outputDir: string,
  signal?: AbortSignal
) {
  signal?.throwIfAborted()
  await mkdir(outputDir, { recursive: true })
  const directory = await mkdtemp(join(resolve(outputDir), 'next-coverage-'))
  const jsonPath = join(directory, 'coverage.json')
  const textPath = join(directory, 'coverage.txt')
  const text = [
    `Next Node line coverage: ${report.complete ? 'complete' : 'INCOMPLETE'}`,
    `Lines: ${report.totals.covered}/${report.totals.executable} (${report.totals.percent === null ? 'n/a' : report.totals.percent.toFixed(2) + '%'})`,
    ...report.files.map(
      (file) =>
        `${file.file}: ${file.coveredLines.length}/${file.executableLines.length}`
    ),
    ...report.errors.map((error) => `ERROR: ${error}`),
    '',
  ].join('\n')
  try {
    signal?.throwIfAborted()
    await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', {
      flag: 'wx',
      signal,
    })
    await writeFile(textPath, text, { flag: 'wx', signal })
    signal?.throwIfAborted()
    return { jsonPath, textPath, text }
  } catch (error) {
    let failure = error
    if (signal?.aborted && error !== signal.reason) {
      try {
        // Native fs errors can originate in another realm. Do not inspect the
        // caller's cancellation reason or let hostile error getters replace it.
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'ABORT_ERR'
        ) {
          failure = signal.reason
        }
      } catch {}
    }
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (cleanupError) {
      throw new AggregateError(
        [failure, cleanupError],
        'Coverage report write and cleanup failed'
      )
    }
    throw failure
  }
}
