import picomatch from 'next/dist/compiled/picomatch'
import { relative, sep } from 'path'
import type { StandardCoverageOptions, StandardCoverageMetric } from './types'

/** Standard dotted flags opt into the standard report path; bare coverage is unchanged. */
export function parseStandardCoverageOptions(
  flags: Record<string, unknown>
): StandardCoverageOptions | undefined {
  if (
    !Object.keys(flags).some(
      (key) => key.startsWith('coverage.') && flags[key] !== undefined
    )
  )
    return
  const list = (key: string): string[] | undefined => {
    const value = flags[`coverage.${key}`]
    if (value === undefined) return
    if (
      !Array.isArray(value) ||
      !value.length ||
      value.some((item) => typeof item !== 'string' || !item)
    )
      throw new Error(`--coverage.${key} requires at least one nonempty value.`)
    return value
  }
  const reporter = list('reporter') ?? ['json', 'lcov']
  for (const value of reporter)
    if (value !== 'json' && value !== 'lcov')
      throw new Error(
        `Standard coverage reporter "${value}" is unsupported; use json or lcov.`
      )
  const thresholds: StandardCoverageOptions['thresholds'] = {}
  for (const metric of [
    'statements',
    'functions',
    'branches',
    'lines',
  ] as StandardCoverageMetric[]) {
    const input = flags[`coverage.thresholds.${metric}`]
    if (input === undefined) continue
    const value =
      typeof input === 'number' || (typeof input === 'string' && input.trim())
        ? Number(input)
        : NaN
    if (!Number.isFinite(value) || value < 0 || value > 100)
      throw new Error(
        `--coverage.thresholds.${metric} must be a percentage between 0 and 100.`
      )
    thresholds[metric] = value
  }
  const reportsDirectory = flags['coverage.reportsDirectory'] ?? 'coverage'
  if (typeof reportsDirectory !== 'string' || !reportsDirectory.trim())
    throw new Error(
      '--coverage.reportsDirectory requires a nonempty directory.'
    )
  const reportOnFailure = flags['coverage.reportOnFailure'] ?? false
  if (![true, false, 'true', 'false'].includes(reportOnFailure as boolean))
    throw new Error('--coverage.reportOnFailure must be true or false.')
  const cleanOnRerun = flags['coverage.cleanOnRerun'] ?? true
  if (![true, false, 'true', 'false'].includes(cleanOnRerun as boolean))
    throw new Error('--coverage.cleanOnRerun must be true or false.')
  return {
    cleanOnRerun: cleanOnRerun === true || cleanOnRerun === 'true',
    reporter: [...new Set(reporter)] as StandardCoverageOptions['reporter'],
    include: list('include'),
    exclude: list('exclude') ?? [],
    reportsDirectory,
    reportOnFailure: reportOnFailure === true || reportOnFailure === 'true',
    thresholds,
  }
}

export function standardCoverageSourceSelector(
  root: string,
  options: StandardCoverageOptions
) {
  const include = options.include ? picomatch(options.include) : undefined
  const exclude = picomatch(options.exclude)
  return (file: string) => {
    const path = relative(root, file).split(sep).join('/')
    return (!include || include(path)) && !exclude(path)
  }
}
