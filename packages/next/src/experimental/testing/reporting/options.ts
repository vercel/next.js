export type ResultOutputFile = string | Readonly<Record<string, string>>

export function parseConfiguredReporters(value: unknown): {
  reporters?: string[]
} {
  if (value === undefined) return {}
  if (typeof value === 'string') return { reporters: [value] }
  if (
    !Array.isArray(value) ||
    value.some((reporter) => typeof reporter !== 'string')
  ) {
    throw new TypeError(
      'test.reporters must be a string or an array of reporter names.'
    )
  }
  return { reporters: [...value] }
}

export function parseConfiguredOutputFile(value: unknown): {
  outputFile?: ResultOutputFile
} {
  if (value === undefined) return {}
  if (typeof value === 'string') return { outputFile: value }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(
      'test.outputFile must be a string or a reporter-path map.'
    )
  }
  const entries = Object.entries(value)
  if (entries.some(([, path]) => typeof path !== 'string')) {
    throw new TypeError('test.outputFile paths must be strings.')
  }
  return { outputFile: Object.fromEntries(entries) }
}
