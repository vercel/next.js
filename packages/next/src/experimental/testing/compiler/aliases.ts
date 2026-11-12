import { isAbsolute, relative, sep } from 'node:path'
import type { NextConfigComplete } from '../../../server/config-shared'
import type { TestProfile } from '../contracts'

export interface CompilerAliases {
  version: 1
  entries: { find: string; replacement: string }[]
  inputs: string[]
}
function unsupported(message: string): never {
  throw new Error(`Unsupported setting config.resolve.alias: ${message}`)
}
function plain(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
}
function fields(value: Record<string, unknown>, allowed?: readonly string[]) {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (allowed && !allowed.includes(key)))
      unsupported(`field ${String(key)} is not implemented`)
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
      unsupported('accessors are not implemented')
  }
}
function matches(find: string, request: string) {
  return request === find || request.startsWith(find + '/')
}

/** Extract data only; all subsequent resolution remains in the Next graph. */
export function prepareCompilerAliases(value: unknown): {
  value: unknown
  aliases?: CompilerAliases
} {
  if (!value || typeof value !== 'object' || !('resolve' in value))
    return { value }
  if (!plain(value) || !Object.hasOwn(value, 'resolve'))
    unsupported('configuration must be a plain object with own resolve')
  if (!('value' in Object.getOwnPropertyDescriptor(value, 'resolve')!))
    unsupported('resolve accessors are not implemented')
  if (!plain(value.resolve)) unsupported('resolve must be a plain object')
  fields(value.resolve, ['alias'])
  if (!Object.hasOwn(value.resolve, 'alias'))
    unsupported('resolve requires an own alias mapping')
  const configured = value.resolve.alias
  if (configured === undefined) unsupported('resolve requires an alias mapping')
  const entries: CompilerAliases['entries'] = []
  let candidates: { find: unknown; replacement: unknown }[]
  if (Array.isArray(configured)) {
    if (Object.getPrototypeOf(configured) !== Array.prototype)
      unsupported('ordered alias arrays must be plain arrays')
    for (const key of Reflect.ownKeys(configured)) {
      if (
        typeof key !== 'string' ||
        (key !== 'length' && !/^(?:0|[1-9]\d*)$/.test(key)) ||
        !('value' in Object.getOwnPropertyDescriptor(configured, key)!)
      )
        unsupported(
          'ordered alias array metadata or accessors are not implemented'
        )
    }
    candidates = Array.from(configured, (entry) => {
      if (!plain(entry)) unsupported('ordered entries must be plain objects')
      fields(entry, ['find', 'replacement'])
      if (!Object.hasOwn(entry, 'find') || !Object.hasOwn(entry, 'replacement'))
        unsupported('ordered entries require own find and replacement fields')
      return { find: entry.find, replacement: entry.replacement }
    })
  } else {
    if (!plain(configured))
      unsupported('alias must be a plain object or ordered string entry array')
    fields(configured)
    candidates = Object.entries(configured).map(([find, replacement]) => ({
      find,
      replacement,
    }))
  }
  for (const { find, replacement } of candidates) {
    if (
      typeof find !== 'string' ||
      !find ||
      /[*?#\\\s]/.test(find) ||
      find.startsWith('.') ||
      find.startsWith('/') ||
      /^[a-z][a-z\d+.-]*:/i.test(find) ||
      find.endsWith('/') ||
      find.split('/').some((part) => !part || part === '.' || part === '..')
    )
      unsupported(
        'only nonempty bare string finds without patterns, queries or trailing slashes are implemented'
      )
    if (
      ['next', 'vite', 'vitest', '@vitest'].some((name) => matches(name, find))
    )
      unsupported(`cannot replace protected framework specifier ${find}`)
    if (
      typeof replacement !== 'string' ||
      !isAbsolute(replacement) ||
      /[*?#$\\]/.test(replacement)
    )
      unsupported(
        `replacement for ${find} must be an absolute filesystem path without patterns, queries or replacement substitutions`
      )
    // A later narrower entry is wholly shadowed by an earlier prefix match.
    // Earlier narrower entries retain native exact/longest-prefix priority.
    if (!entries.some((entry) => matches(entry.find, find)))
      entries.push({ find, replacement })
  }
  const { resolve: _resolve, ...serializable } = value
  return {
    value: serializable,
    ...(entries.length ? { aliases: { version: 1, entries, inputs: [] } } : {}),
  }
}

/** Clone this compiler's configuration and use the actual Next alias resolver. */
export function withCompilerAliases(
  config: NextConfigComplete,
  dir: string,
  profile: TestProfile,
  aliases?: CompilerAliases
): NextConfigComplete {
  if (!aliases) return config
  if (
    aliases.version !== 1 ||
    profile.environment !== 'node' ||
    profile.mode !== 'development' ||
    profile.route ||
    profile.browserClient
  )
    unsupported(
      'mapped aliases currently require a route-less development Node profile'
    )
  const existing = config.turbopack?.resolveAlias ?? {}
  const mappings: Record<string, string> = Object.create(null)
  for (const { find, replacement } of aliases.entries) {
    for (const key of Object.keys(existing)) {
      const prefix = key.split('*')[0].replace(/\/$/, '')
      if (!prefix || matches(find, prefix) || matches(prefix, find))
        unsupported(
          `ordering with existing Next alias ${key} is not implemented`
        )
    }
    let target = relative(dir, replacement).split(sep).join('/')
    if (!target) target = '.'
    else if (!target.startsWith('../') && !target.startsWith('./'))
      target = './' + target
    mappings[find] = target
    mappings[find + '/*'] = target + '/*'
  }
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      resolveAlias: { ...existing, ...mappings },
    },
  }
}
