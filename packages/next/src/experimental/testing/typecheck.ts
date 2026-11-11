/** The one-shot tsc contract. Compiler build/watch modes have separate owners. */
export interface TestTypecheckConfig {
  enabled: boolean
  only: boolean
  include: string[]
  exclude: string[]
  allowJs: boolean
  ignoreSourceErrors: boolean
  tsconfig?: string
  spawnTimeout?: number
}

export function parseTestTypecheckConfig(
  value: unknown,
  label: string
): TestTypecheckConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`)
  const config = value as Record<string, unknown>
  for (const key of Object.keys(config)) {
    if (key === 'checker' && config[key] === 'tsc') continue
    if (key === 'build' && config[key] === false) continue
    if (
      ![
        'enabled',
        'only',
        'include',
        'exclude',
        'allowJs',
        'ignoreSourceErrors',
        'tsconfig',
        'spawnTimeout',
      ].includes(key)
    )
      throw new Error(
        `Unsupported ${label}.${key}: type-test checking currently supports one-shot tsc without build mode.`
      )
  }
  for (const key of ['enabled', 'only', 'allowJs', 'ignoreSourceErrors']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean')
      throw new Error(`${label}.${key} must be a boolean.`)
  }
  const patterns = (key: 'include' | 'exclude', fallback: string[]) => {
    const selected = config[key] ?? fallback
    if (
      !Array.isArray(selected) ||
      selected.some((item) => typeof item !== 'string' || !item.trim())
    )
      throw new Error(`${label}.${key} must be an array of nonempty strings.`)
    return selected as string[]
  }
  if (
    config.tsconfig !== undefined &&
    (typeof config.tsconfig !== 'string' || !config.tsconfig.trim())
  )
    throw new Error(`${label}.tsconfig must be a nonempty path.`)
  return {
    enabled:
      config.enabled === true ||
      (config.enabled === undefined && config.only === true),
    only: config.only === true,
    include: patterns('include', ['**/*.{test,spec}-d.?(c|m)[jt]s?(x)']),
    exclude: patterns('exclude', ['**/node_modules/**', '**/.git/**']),
    allowJs: config.allowJs === true,
    ignoreSourceErrors: config.ignoreSourceErrors === true,
    ...(Object.hasOwn(config, 'spawnTimeout')
      ? { spawnTimeout: config.spawnTimeout as number | undefined }
      : {}),
    ...(config.tsconfig === undefined
      ? {}
      : { tsconfig: config.tsconfig as string }),
  }
}
