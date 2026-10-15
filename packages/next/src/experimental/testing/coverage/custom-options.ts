import type { CustomCoverageConfig } from './custom-types'

/** Project-configured coverage is deliberately distinct from existing CLI V8 modes. */
export function parseCustomCoverageConfig(
  value: unknown
): CustomCoverageConfig | undefined {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Custom coverage requires an object configuration.')
  const options = value as Record<string, unknown>
  for (const key of Object.keys(options))
    if (
      ![
        'enabled',
        'provider',
        'customProviderModule',
        'clean',
        'reportsDirectory',
        'reportOnFailure',
      ].includes(key)
    )
      throw new Error(`Unsupported custom coverage option: ${key}`)
  if (options.provider !== 'custom')
    throw new Error(
      'Project coverage currently requires provider: "custom"; select V8 using --coverage flags.'
    )
  if (options.enabled !== undefined && typeof options.enabled !== 'boolean')
    throw new Error('Custom coverage enabled must be a boolean.')
  if (options.enabled === false) return
  if (
    typeof options.customProviderModule !== 'string' ||
    !options.customProviderModule.trim()
  )
    throw new Error('Custom coverage requires a nonempty customProviderModule.')
  for (const key of ['clean', 'reportOnFailure'])
    if (options[key] !== undefined && typeof options[key] !== 'boolean')
      throw new Error(`Custom coverage ${key} must be a boolean.`)
  if (
    options.reportsDirectory !== undefined &&
    (typeof options.reportsDirectory !== 'string' ||
      !options.reportsDirectory.trim())
  )
    throw new Error('Custom coverage reportsDirectory must be a nonempty path.')
  return {
    enabled: true,
    provider: 'custom',
    customProviderModule: options.customProviderModule,
    clean: options.clean !== false,
    reportsDirectory:
      (options.reportsDirectory as string | undefined) ?? './coverage',
    reportOnFailure: options.reportOnFailure === true,
  }
}
