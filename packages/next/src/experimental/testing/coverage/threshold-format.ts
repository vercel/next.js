import type { StandardCoverageThresholdUpdate } from './types'

type Formatter = (value: number, previous: number) => number
type RecordValue = Record<string, unknown>

function record(value: unknown): value is RecordValue {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function callback(settings: RecordValue | undefined): Formatter | undefined {
  const coverage = settings?.coverage
  const thresholds = record(coverage) ? coverage.thresholds : undefined
  return record(thresholds) && typeof thresholds.autoUpdate === 'function'
    ? (thresholds.autoUpdate as Formatter)
    : undefined
}

function serializable(settings: RecordValue): RecordValue {
  if (!callback(settings)) return settings
  const coverage = settings.coverage as RecordValue
  return {
    ...settings,
    coverage: {
      ...coverage,
      thresholds: { ...(coverage.thresholds as RecordValue), autoUpdate: true },
    },
  }
}

/** Keep the real closure in its evaluated configuration realm, outside IPC data. */
export function retainCoverageThresholdFormatter(
  value: unknown,
  projectConfig = false
): { value: unknown; formatter?: Formatter } {
  if (!record(value)) return { value }
  const test = record(value.test) ? value.test : undefined
  const projects = test?.projects ?? value.projects
  const settings = Array.isArray(projects)
    ? projects.map((project) =>
        record(project) && record(project.test) ? project.test : project
      )
    : []
  const callbacks = [test, ...settings].filter(record).filter(callback)
  if (!callbacks.length) return { value }
  if (
    projectConfig ||
    (Array.isArray(projects) && (projects.length !== 1 || !record(settings[0])))
  )
    throw new Error(
      'Coverage threshold formatters currently require one inline project in the root configuration.'
    )
  const selected = record(settings[0]) ? settings[0] : undefined
  const formatter = callback(
    selected && 'coverage' in selected ? selected : test
  )
  const normalizedProjects = Array.isArray(projects)
    ? projects.map((project) =>
        record(project) && record(project.test)
          ? { ...project, test: serializable(project.test) }
          : record(project)
            ? serializable(project)
            : project
      )
    : undefined
  return {
    value: test
      ? {
          ...value,
          test: {
            ...serializable(test),
            ...(normalizedProjects ? { projects: normalizedProjects } : {}),
          },
        }
      : { ...value, projects: normalizedProjects },
    ...(formatter ? { formatter } : {}),
  }
}

/** Invoke ordered improvements synchronously with an undefined receiver. */
export function formatCoverageThresholdUpdates(
  formatter: Formatter | undefined,
  updates: readonly StandardCoverageThresholdUpdate[]
): StandardCoverageThresholdUpdate[] {
  if (!formatter)
    throw new Error(
      'No coverage threshold formatter belongs to this configuration.'
    )
  return updates.map((update) => {
    const value = formatter(update.value, update.previous)
    if (typeof value !== 'number')
      throw new TypeError(
        'A coverage threshold formatter must return a number.'
      )
    return { ...update, value }
  })
}
