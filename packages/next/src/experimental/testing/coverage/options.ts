import picomatch from 'next/dist/compiled/picomatch'
import { relative, sep } from 'path'
import { isDeepStrictEqual } from 'util'
import { configDefaults } from '../config-api'
import type {
  ProjectStandardCoverageConfig,
  StandardCoverageOptions,
  StandardCoverageMetric,
} from './types'

const agentReports = configDefaults.reporters[0] === 'minimal'

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
    if (
      value !== 'json' &&
      value !== 'json-summary' &&
      value !== 'text-summary' &&
      value !== 'lcov' &&
      value !== 'lcovonly'
    )
      throw new Error(
        `Standard coverage reporter "${value}" is unsupported; use json, json-summary, text-summary, lcov, or lcovonly.`
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
    if (!Number.isFinite(value) || value > 100)
      throw new Error(
        `--coverage.thresholds.${metric} must be a percentage between 0 and 100 or a negative maximum uncovered count.`
      )
    thresholds[metric] = value
  }
  const perFile = flags['coverage.thresholds.perFile']
  if (perFile !== undefined) {
    if (![true, false, 'true', 'false'].includes(perFile as boolean))
      throw new Error('--coverage.thresholds.perFile must be true or false.')
    thresholds.perFile = perFile === true || perFile === 'true'
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

/** Configured V8 uses the same captures and maps, with the reference defaults. */
export function parseProjectStandardCoverage(
  value: unknown
): ProjectStandardCoverageConfig | undefined {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('V8 coverage requires an object configuration.')
  const config = value as Record<string, unknown>
  if (config.provider === 'custom') return
  if (config.provider !== undefined && config.provider !== 'v8')
    throw new Error('Project coverage provider must be v8 or custom.')
  for (const key of Object.keys(config))
    if (
      ![
        'provider',
        'enabled',
        'include',
        'exclude',
        'reporter',
        'reportsDirectory',
        'reportOnFailure',
        'clean',
        'cleanOnRerun',
        'thresholds',
      ].includes(key)
    )
      throw new Error(`Unsupported V8 coverage option: ${key}`)
  for (const key of ['enabled', 'reportOnFailure', 'clean', 'cleanOnRerun'])
    if (config[key] !== undefined && typeof config[key] !== 'boolean')
      throw new Error(`V8 coverage ${key} must be a boolean.`)
  const names =
    config.reporter === undefined
      ? ['text', 'html', 'clover', 'json']
      : typeof config.reporter === 'string'
        ? [config.reporter]
        : config.reporter
  if (!Array.isArray(names))
    throw new Error('V8 coverage reporter must be a name or an array.')
  const reporter: StandardCoverageOptions['reporter'] = []
  const reporterOptions: NonNullable<
    StandardCoverageOptions['reporterOptions']
  > = {}
  for (const entry of names) {
    const name = Array.isArray(entry) ? entry[0] : entry
    const options = Array.isArray(entry) ? (entry[1] ?? {}) : {}
    if (
      ![
        'json',
        'json-summary',
        'text-summary',
        'lcov',
        'lcovonly',
        'text',
        'html',
        'clover',
      ].includes(name) ||
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      (Array.isArray(entry) && entry.length > 2)
    )
      throw new Error('Unsupported V8 coverage reporter configuration.')
    for (const key of Object.keys(options))
      if (
        name !== 'text' ||
        key !== 'skipFull' ||
        typeof options[key] !== 'boolean'
      )
        throw new Error(`Unsupported V8 coverage reporter option: ${key}`)
    if (!reporter.includes(name)) reporter.push(name)
    if (name === 'text')
      reporterOptions.text = {
        ...(agentReports ? { skipFull: true } : {}),
        ...options,
      }
  }
  if (
    agentReports &&
    reporter.includes('text') &&
    !reporter.includes('text-summary')
  )
    reporter.push('text-summary')
  const flags: Record<string, unknown> = {
    // Existing flag validation also owns include/exclude/report directory and
    // threshold units. Formatter names are validated separately above.
    'coverage.reporter': ['json'],
  }
  for (const key of [
    'include',
    'exclude',
    'reportsDirectory',
    'reportOnFailure',
    'cleanOnRerun',
  ])
    if (config[key] !== undefined) {
      if (
        (key === 'include' || key === 'exclude') &&
        Array.isArray(config[key]) &&
        config[key].length === 0
      )
        continue
      flags[`coverage.${key}`] = config[key]
    }
  if (config.thresholds !== undefined) {
    if (
      !config.thresholds ||
      typeof config.thresholds !== 'object' ||
      Array.isArray(config.thresholds)
    )
      throw new Error('V8 coverage thresholds must be an object.')
    for (const [key, threshold] of Object.entries(config.thresholds)) {
      if (
        !['statements', 'functions', 'branches', 'lines', 'perFile'].includes(
          key
        )
      )
        throw new Error(`Unsupported V8 coverage threshold: ${key}`)
      flags[`coverage.thresholds.${key}`] = threshold
    }
  }
  return {
    enabled: config.enabled === true,
    options: {
      ...parseStandardCoverageOptions(flags)!,
      ...(Array.isArray(config.include) && !config.include.length
        ? { include: [] }
        : {}),
      reporter,
      ...(Object.keys(reporterOptions).length ? { reporterOptions } : {}),
      formatterReports: true,
      clean: config.clean !== false,
    },
  }
}

/** Explicit CLI fields replace their configured counterpart, not other fields. */
export function resolveProjectStandardCoverage(
  projects: readonly { standardCoverage?: ProjectStandardCoverageConfig }[],
  flags: Record<string, unknown>,
  cli: StandardCoverageOptions | undefined
): {
  enabled: boolean
  options?: StandardCoverageOptions
  configured: boolean
} {
  const selected = projects.map((project) => project.standardCoverage)
  const config = selected.find((value) => value !== undefined)
  if (flags.coverage === false)
    return { enabled: false, configured: config !== undefined }
  if (!config)
    return {
      enabled: flags.coverage !== false && (flags.coverage === true || !!cli),
      ...(flags.coverage !== false && cli ? { options: cli } : {}),
      configured: false,
    }
  if (!selected.every((value) => isDeepStrictEqual(value, config)))
    throw new Error(
      'Selected projects must share the same V8 coverage configuration.'
    )
  const enabled =
    flags.coverage !== false &&
    (flags.coverage === true || !!cli || config.enabled)
  if (!enabled) return { enabled: false, configured: true }
  const options = structuredClone(config.options)
  if (cli) {
    for (const key of [
      'reporter',
      'include',
      'exclude',
      'reportsDirectory',
      'reportOnFailure',
      'cleanOnRerun',
    ] as const)
      if (flags[`coverage.${key}`] !== undefined)
        Object.assign(options, { [key]: cli[key] })
    for (const key of [
      'statements',
      'functions',
      'branches',
      'lines',
      'perFile',
    ] as const)
      if (flags[`coverage.thresholds.${key}`] !== undefined)
        Object.assign(options.thresholds, { [key]: cli.thresholds[key] })
  }
  return { enabled: true, options, configured: true }
}
