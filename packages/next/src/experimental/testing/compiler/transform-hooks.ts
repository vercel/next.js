import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SourceMapConsumer,
  SourceMapGenerator,
} from 'next/dist/compiled/source-map'
import type { RawSourceMap } from 'next/dist/compiled/source-map'
import { parse } from 'next/dist/compiled/babel/parser'
import { usesInSourceTestMarker } from '../in-source'

export interface CompilerTransformSourceMap {
  version: 3
  file?: string
  sources: string[]
  names: string[]
  mappings: string
  sourcesContent?: (string | null)[]
}

type Hook = (
  this: unknown,
  code: string,
  id: string,
  options: { ssr: true; moduleType: string }
) => unknown
export interface RetainedCompilerTransforms {
  realm: string
  hooks: { name: string; transform: Hook }[]
}
export interface CompilerTransformInput {
  file: string
  query: string
  code: string
  map?: CompilerTransformSourceMap
  moduleType: string
}
export interface CompilerTransformResult {
  code: string
  map?: CompilerTransformSourceMap
  dependencies: string[]
  warnings: string[]
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function unsupported(message: string): never {
  throw new Error(`Unsupported Next test compiler transform: ${message}`)
}

/** These APIs require native helper planning before source transforms. */
export function assertTransformSource(source: string, file: string): void {
  if (usesInSourceTestMarker(source, file))
    unsupported(
      'in-source compiler helpers require a native transform/planning phase'
    )
  const syntax = parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: file,
    plugins: [
      'jsx',
      'decorators-legacy',
      ...(/\.[cm]?tsx?$/.test(file) ? ['typescript' as const] : []),
    ],
  })
  for (const node of syntax.program.body) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== 'vitest')
      continue
    for (const binding of node.specifiers) {
      if (
        binding.type === 'ImportNamespaceSpecifier' ||
        (binding.type === 'ImportSpecifier' &&
          ['vi', 'vitest'].includes(
            binding.imported.type === 'Identifier'
              ? binding.imported.name
              : binding.imported.value
          ))
      )
        unsupported(
          'Vitest namespace and mock API imports require a native transform/planning phase'
        )
    }
  }
  const queue: unknown[] = [syntax]
  while (queue.length) {
    const value = queue.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value)) {
      queue.push(...value)
      continue
    }
    const node = value as { type?: string; name?: string }
    if (
      node.type === 'Identifier' &&
      (node.name === 'vi' || node.name === 'vitest')
    )
      unsupported(
        'Vitest mock API identifiers require a native transform/planning phase'
      )
    queue.push(...Object.values(node))
  }
}

function dataFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string
) {
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    unsupported(`${label} must be a plain object`)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key))
      unsupported(`${label} field ${String(key)} is not implemented`)
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
      unsupported(`${label} accessors are not supported`)
  }
}

/** Keep the exact evaluated functions in this configuration realm, never IPC. */
export function retainCompilerTransforms(value: unknown): {
  value: unknown
  retained?: RetainedCompilerTransforms
} {
  if (record(value) && record(value.test) && Array.isArray(value.test.projects))
    for (const project of value.test.projects)
      if (record(project) && 'plugins' in project)
        unsupported(
          'inline project plugins are not implemented; use an owned external project configuration'
        )
  if (!record(value) || !('plugins' in value)) return { value }
  if (
    !Object.hasOwn(value, 'plugins') ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    unsupported('plugin configuration must be a plain object with own plugins')
  if (!('value' in Object.getOwnPropertyDescriptor(value, 'plugins')!))
    unsupported('plugins accessors are not supported')
  if (!record(value.test) || !Array.isArray(value.plugins))
    unsupported(
      'plugins require an executable test configuration and a flat array'
    )
  const hooks: RetainedCompilerTransforms['hooks'] = []
  for (const plugin of value.plugins) {
    if (plugin === false || plugin === null || plugin === undefined) continue
    if (!record(plugin)) unsupported('every plugin must be an object')
    dataFields(plugin, ['name', 'transform'], 'plugin')
    if (
      !Object.hasOwn(plugin, 'name') ||
      typeof plugin.name !== 'string' ||
      !plugin.name.trim()
    )
      unsupported('every plugin must have a nonempty name')
    if (
      !Object.hasOwn(plugin, 'transform') ||
      typeof plugin.transform !== 'function'
    )
      unsupported(`plugin ${plugin.name} requires a plain transform function`)
    hooks.push({ name: plugin.name, transform: plugin.transform as Hook })
  }
  const { plugins: _plugins, ...serializable } = value
  return {
    value: serializable,
    ...(hooks.length ? { retained: { realm: randomUUID(), hooks } } : {}),
  }
}

function sourcePath(
  source: string,
  root: string | undefined,
  file: string
): string {
  if (source.startsWith('file:')) {
    const url = new URL(source)
    if (url.search || url.hash)
      unsupported(
        'source-map file URLs with queries or fragments are not supported'
      )
    return fileURLToPath(url)
  }
  if (
    /^[a-z][a-z\d+.-]*:/i.test(source) ||
    (root && /^[a-z][a-z\d+.-]*:/i.test(root))
  )
    unsupported('source maps require file source identities')
  return resolve(dirname(file), root ?? '.', source || file)
}
function mapValue(
  value: unknown,
  file: string
): CompilerTransformSourceMap | undefined {
  if (value === null || value === undefined) return undefined
  const map = typeof value === 'string' ? JSON.parse(value) : value
  if (!record(map)) unsupported('invalid source map')
  dataFields(
    map,
    [
      'version',
      'file',
      'sources',
      'sourcesContent',
      'sourceRoot',
      'names',
      'mappings',
    ],
    'source map'
  )
  if (
    (map.file !== undefined && typeof map.file !== 'string') ||
    map.version !== 3 ||
    !Array.isArray(map.sources) ||
    map.sources.some((source) => typeof source !== 'string') ||
    !Array.isArray(map.names) ||
    map.names.some((name) => typeof name !== 'string') ||
    typeof map.mappings !== 'string' ||
    Object.hasOwn(map, 'sections') ||
    (map.sourceRoot !== undefined && typeof map.sourceRoot !== 'string')
  )
    unsupported('invalid or unsupported source map')
  if (
    map.sourcesContent !== undefined &&
    (!Array.isArray(map.sourcesContent) ||
      map.sourcesContent.length !== map.sources.length ||
      map.sourcesContent.some(
        (content) => content !== null && typeof content !== 'string'
      ))
  )
    unsupported('invalid source-map sourcesContent')
  return {
    version: 3,
    file,
    sources: map.sources.map((source) =>
      sourcePath(source as string, map.sourceRoot as string | undefined, file)
    ),
    names: map.names as string[],
    mappings: map.mappings,
    ...(map.sourcesContent
      ? { sourcesContent: map.sourcesContent as string[] }
      : {}),
  } as CompilerTransformSourceMap
}
function compose(
  next: CompilerTransformSourceMap,
  previous: CompilerTransformSourceMap | undefined,
  file: string
): CompilerTransformSourceMap {
  if (!previous) return next
  const generator = SourceMapGenerator.fromSourceMap(
    new SourceMapConsumer(next as unknown as RawSourceMap)
  )
  generator.applySourceMap(
    new SourceMapConsumer(previous as unknown as RawSourceMap),
    file
  )
  return JSON.parse(generator.toString())
}

export async function runCompilerTransforms(
  retained: RetainedCompilerTransforms,
  input: CompilerTransformInput
): Promise<CompilerTransformResult> {
  if (
    !isAbsolute(input.file) ||
    typeof input.query !== 'string' ||
    typeof input.code !== 'string'
  )
    unsupported('invalid source request')
  let code = input.code
  let map = mapValue(input.map, input.file)
  const dependencies = new Set<string>()
  const warnings: string[] = []
  for (const plugin of retained.hooks) {
    const context = new Proxy(Object.create(null), {
      get(_target, key) {
        if (key === 'error')
          return (error: unknown): never => {
            throw new Error(`[${plugin.name}] ${String(error)}`)
          }
        if (key === 'warn')
          return (warning: unknown): void => {
            warnings.push(`[${plugin.name}] ${String(warning)}`)
          }
        if (key === 'addWatchFile')
          return (file: unknown) => {
            if (typeof file !== 'string' || !isAbsolute(file))
              unsupported(
                `plugin ${plugin.name} addWatchFile requires an absolute file path`
              )
            dependencies.add(file)
          }
        return unsupported(
          `plugin ${plugin.name} context.${String(key)} is not implemented`
        )
      },
      set() {
        return unsupported(
          `plugin ${plugin.name} context mutation is not implemented`
        )
      },
    })
    let result: unknown
    try {
      result = await plugin.transform.call(
        context,
        code,
        input.file + input.query,
        { ssr: true, moduleType: input.moduleType }
      )
    } catch (cause) {
      throw new Error(
        `Compiler transform ${plugin.name} failed for ${input.file}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      )
    }
    if (result === null || result === undefined) continue
    if (typeof result === 'string') {
      if (result !== code) map = undefined
      code = result
      continue
    }
    if (!record(result))
      unsupported(`plugin ${plugin.name} returned an unsupported result`)
    dataFields(result, ['code', 'map'], `plugin ${plugin.name} result`)
    if (!Object.hasOwn(result, 'code') || typeof result.code !== 'string')
      unsupported(
        `plugin ${plugin.name} must return a string, null, undefined or {code,map}`
      )
    const next = mapValue(result.map, input.file)
    if (next) map = compose(next, map, input.file)
    else if (result.code !== code) map = undefined
    code = result.code
  }
  assertTransformSource(code, input.file)
  return {
    code,
    ...(map ? { map } : {}),
    dependencies: [...dependencies],
    warnings,
  }
}
