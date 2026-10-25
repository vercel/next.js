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
  const provider = flags['coverage.provider']
  if (provider !== undefined && provider !== 'v8')
    throw new Error(
      'Standard coverage CLI currently supports only the V8 provider.'
    )
  const requestedReports = list('reporter')
  const formatterReports =
    provider === 'v8' ||
    requestedReports?.some((name) =>
      [
        'text',
        'html',
        'clover',
        'cobertura',
        'html-spa',
        'teamcity',
        'text-lcov',
        'none',
      ].includes(name)
    )
  const reporter = [
    ...(requestedReports ??
      (provider === 'v8'
        ? ['text', 'html', 'clover', 'json']
        : ['json', 'lcov'])),
  ]
  for (const value of reporter)
    if (
      value !== 'json' &&
      value !== 'json-summary' &&
      value !== 'text-summary' &&
      value !== 'lcov' &&
      value !== 'lcovonly' &&
      value !== 'text' &&
      value !== 'html' &&
      value !== 'clover' &&
      value !== 'cobertura' &&
      value !== 'html-spa' &&
      value !== 'teamcity' &&
      value !== 'text-lcov' &&
      value !== 'none'
    )
      throw new Error(
        `Standard coverage reporter "${value}" is unsupported; use json, json-summary, text, text-summary, html, html-spa, clover, cobertura, teamcity, text-lcov, none, lcov, or lcovonly.`
      )
  if (
    formatterReports &&
    agentReports &&
    reporter.includes('text') &&
    !reporter.includes('text-summary')
  )
    reporter.push('text-summary')
  const thresholds: StandardCoverageOptions['thresholds'] = {}
  const all = flags['coverage.thresholds.100']
  if (all !== undefined) {
    if (![true, false, 'true', 'false'].includes(all as boolean))
      throw new Error('--coverage.thresholds.100 must be true or false.')
    thresholds[100] = all === true || all === 'true'
  }
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
  const autoUpdate = flags['coverage.thresholds.autoUpdate']
  if (autoUpdate !== undefined) {
    if (typeof autoUpdate !== 'boolean' && typeof autoUpdate !== 'string')
      throw new Error('--coverage.thresholds.autoUpdate must be a boolean.')
    // The pinned CLI also accepts boolean words, numeric zero and a bare flag.
    thresholds.autoUpdate =
      autoUpdate === true ||
      (typeof autoUpdate === 'string' &&
        !['false', 'no'].includes(autoUpdate) &&
        (autoUpdate === '' ||
          Number.isNaN(Number(autoUpdate)) ||
          Number(autoUpdate) !== 0))
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
    ...(formatterReports
      ? {
          formatterReports: true as const,
          clean: true,
          ...(agentReports && reporter.includes('text')
            ? { reporterOptions: { text: { skipFull: true } } }
            : {}),
        }
      : {}),
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
        'cobertura',
        'html-spa',
        'teamcity',
        'text-lcov',
        'none',
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
  const thresholdGroups: NonNullable<
    StandardCoverageOptions['thresholdGroups']
  > = []
  if (config.thresholds !== undefined) {
    if (
      !config.thresholds ||
      typeof config.thresholds !== 'object' ||
      Array.isArray(config.thresholds)
    )
      throw new Error('V8 coverage thresholds must be an object.')
    for (const [key, threshold] of Object.entries(config.thresholds)) {
      if (
        [
          '100',
          'statements',
          'functions',
          'branches',
          'lines',
          'perFile',
          'autoUpdate',
        ].includes(key)
      ) {
        flags[`coverage.thresholds.${key}`] = threshold
        continue
      }
      if (
        !threshold ||
        typeof threshold !== 'object' ||
        Array.isArray(threshold)
      )
        throw new Error(`Unsupported V8 coverage threshold: ${key}`)
      const groupFlags: Record<string, unknown> = {
        'coverage.reporter': ['json'],
      }
      for (const [metric, limit] of Object.entries(threshold)) {
        if (
          ![
            '100',
            'statements',
            'functions',
            'branches',
            'lines',
            'perFile',
          ].includes(metric)
        )
          throw new Error(`Unsupported V8 coverage threshold: ${key}.${metric}`)
        groupFlags[`coverage.thresholds.${metric}`] = limit
      }
      thresholdGroups.push({
        pattern: key,
        thresholds: parseStandardCoverageOptions(groupFlags)!.thresholds,
      })
    }
  }
  return {
    enabled: config.enabled === true,
    options: {
      ...parseStandardCoverageOptions(flags)!,
      ...(thresholdGroups.length ? { thresholdGroups } : {}),
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
      enabled: flags.coverage === true,
      ...(cli && flags.coverage === true ? { options: cli } : {}),
      configured: false,
    }
  if (!selected.every((value) => isDeepStrictEqual(value, config)))
    throw new Error(
      'Selected projects must share the same V8 coverage configuration.'
    )
  const enabled =
    flags.coverage !== false && (flags.coverage === true || config.enabled)
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
    if (flags['coverage.thresholds.100'] !== undefined) {
      // The pinned CLI's numeric path replaces its whole thresholds object.
      // Configured shorthand and ordinary metric overrides remain additive.
      options.thresholds = structuredClone(cli.thresholds)
      delete options.thresholdGroups
    } else {
      for (const key of [
        'statements',
        'functions',
        'branches',
        'lines',
        'perFile',
        'autoUpdate',
      ] as const)
        if (flags[`coverage.thresholds.${key}`] !== undefined)
          Object.assign(options.thresholds, { [key]: cli.thresholds[key] })
    }
  }
  return { enabled: true, options, configured: true }
}
