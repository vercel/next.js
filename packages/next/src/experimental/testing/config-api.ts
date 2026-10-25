import { isTestCI as isCI } from './config-environment'
import { availableParallelism } from 'node:os'
import { basename, extname } from 'node:path'
import type { FakeTimerConfig } from '../../compiled/next-test-primitives/timers'

/** Inert configuration helpers. This module never imports Vitest or Vite. */
export interface ConfigEnv {
  command: 'build' | 'serve'
  mode: string
  isSsrBuild?: boolean
  isPreview?: boolean
}
export interface UserConfig extends Record<string, unknown> {
  test?: Record<string, unknown>
}
export type ViteUserConfigFnObject = (env: ConfigEnv) => UserConfig
export type ViteUserConfigFnPromise = (env: ConfigEnv) => Promise<UserConfig>
export type UserConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>
export type UserConfigExport = UserConfig | Promise<UserConfig> | UserConfigFn
export type ViteUserConfig = UserConfig
export type ViteUserConfigFn = UserConfigFn
export type ViteUserConfigExport = UserConfigExport
export function defineConfig(config: UserConfig): UserConfig
export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>
export function defineConfig(
  config: ViteUserConfigFnObject
): ViteUserConfigFnObject
export function defineConfig(
  config: ViteUserConfigFnPromise
): ViteUserConfigFnPromise
export function defineConfig(config: UserConfigExport): UserConfigExport
export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}
export function defineProject(config: UserConfig): UserConfig
export function defineProject(config: Promise<UserConfig>): Promise<UserConfig>
export function defineProject(config: UserConfigFn): UserConfigFn
export function defineProject(config: UserConfigExport): UserConfigExport
export function defineProject(config: UserConfigExport): UserConfigExport {
  return config
}

const isAgent =
  [
    'AI_AGENT',
    'CLAUDECODE',
    'CLAUDE_CODE',
    'REPL_ID',
    'GEMINI_CLI',
    'CODEX_SANDBOX',
    'CODEX_THREAD_ID',
    'OPENCODE',
    'AUGMENT_AGENT',
    'GOOSE_PROVIDER',
    'JUNIE_DATA',
    'JUNIE_SHIM_PATH',
    'COPILOT_AGENT',
    'COPILOT_CLI',
    'CURSOR_AGENT',
  ].some((name) => !!process.env[name]) ||
  /\.pi[\\/]agent/.test(process.env.PATH || '') ||
  /devin/.test(process.env.EDITOR || '') ||
  (!process.stdout.isTTY && /kiro/.test(process.env.TERM_PROGRAM || ''))

export const defaultBrowserPort = 63315
export const defaultInclude: string[] = ['**/*.{test,spec}.?(c|m)[jt]s?(x)']
export const defaultExclude: string[] = ['**/node_modules/**', '**/.git/**']

interface CoverageConfigDefaults {
  provider: 'v8' | 'istanbul' | 'custom'
  enabled: boolean
  clean: boolean
  cleanOnRerun: boolean
  reportsDirectory: string
  exclude: string[]
  reportOnFailure: boolean
  reporter: (string | [string, Record<string, unknown>])[]
  allowExternal: boolean
  excludeAfterRemap: boolean
  processingConcurrency: number
  ignoreClassMethods: string[]
  skipFull: boolean
  watermarks: {
    statements: [number, number]
    functions: [number, number]
    branches: [number, number]
    lines: [number, number]
  }
  autoAttachSubprocess: boolean
}

/** Generic defaults only; publishing them does not install a coverage provider. */
export const coverageConfigDefaults: CoverageConfigDefaults = {
  provider: 'v8',
  enabled: false,
  clean: true,
  cleanOnRerun: true,
  reportsDirectory: './coverage',
  exclude: [],
  reportOnFailure: false,
  reporter: ['text', 'html', 'clover', 'json'],
  allowExternal: false,
  excludeAfterRemap: false,
  processingConcurrency: Math.min(20, availableParallelism()),
  ignoreClassMethods: [],
  skipFull: false,
  watermarks: {
    statements: [50, 80],
    functions: [50, 80],
    branches: [50, 80],
    lines: [50, 80],
  },
  autoAttachSubprocess: false,
}
const fakeTimersDefaults: FakeTimerConfig = {
  loopLimit: 10000,
  shouldClearNativeTimers: true,
}

export const configDefaults = Object.freeze({
  allowOnly: !isCI,
  isolate: true,
  watch: !isCI && process.stdin.isTTY && !isAgent,
  globals: false,
  injectCjsGlobals: true,
  environment: 'node' as const,
  clearMocks: true,
  restoreMocks: false,
  mockReset: false,
  unstubGlobals: false,
  unstubEnvs: false,
  include: defaultInclude,
  exclude: defaultExclude,
  teardownTimeout: 10000,
  forceRerunTriggers: ['**/package.json', '**/{vitest,vite}.config.*'],
  update: false,
  reporters: [
    isAgent ? 'minimal' : 'default',
    ...(process.env.GITHUB_ACTIONS === 'true' ? ['github-actions'] : []),
  ],
  silent: false,
  hideSkippedTests: false,
  api: false,
  ui: false,
  uiBase: '/__vitest__/',
  open: !isCI,
  css: { include: [] as never[] },
  coverage: coverageConfigDefaults,
  fakeTimers: fakeTimersDefaults,
  maxConcurrency: 5,
  dangerouslyIgnoreUnhandledErrors: false,
  typecheck: {
    checker: 'tsc' as const,
    include: ['**/*.{test,spec}-d.?(c|m)[jt]s?(x)'],
    exclude: defaultExclude,
  },
  slowTestThreshold: 300,
  taskTitleValueFormatTruncate: 40,
  disableConsoleIntercept: false,
  detectAsyncLeaks: false,
})

type ConfigRecord = Record<string, any>
const object = (value: unknown): value is ConfigRecord =>
  Object.prototype.toString.call(value) === '[object Object]'
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value]

function aliases(value: ConfigRecord | ConfigRecord[]): ConfigRecord[] {
  const entries = Array.isArray(value)
    ? value
    : Object.keys(value).map((find) => ({ find, replacement: value[find] }))
  return entries.map(({ find, replacement, customResolver }) => {
    if (
      typeof find === 'string' &&
      find.endsWith('/') &&
      replacement.endsWith('/')
    ) {
      find = find.slice(0, -1)
      replacement = replacement.slice(0, -1)
    }
    return {
      find,
      replacement,
      ...(customResolver ? { customResolver } : {}),
    }
  })
}

function inputObject(value: any): ConfigRecord {
  if (typeof value === 'string')
    return { [basename(value, extname(value))]: value }
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((file) => [basename(file, extname(file)), file])
    )
  }
  return value
}

function mergeInput(previous: any, value: any): any {
  if (!previous) return value
  if (!value) return previous
  if (
    (typeof previous === 'string' || Array.isArray(previous)) &&
    (typeof value === 'string' || Array.isArray(value))
  ) {
    return [...array(previous), ...array(value)]
  }
  return { ...inputObject(previous), ...inputObject(value) }
}

const rollupOptionsPaths = new Set([
  'build',
  'worker',
  'optimizeDeps',
  'ssr.optimizeDeps',
])
function warnRollupOptions() {
  const trace = process.env.VITE_DEPRECATION_TRACE
  console[trace ? 'trace' : 'warn'](
    '`optimizeDeps.rollupOptions` / `ssr.optimizeDeps.rollupOptions` is deprecated. Use `optimizeDeps.rolldownOptions` instead. Note that this option may be set by a plugin. ' +
      (trace
        ? 'Showing trace because VITE_DEPRECATION_TRACE is set.'
        : 'Set VITE_DEPRECATION_TRACE=1 to see where it is called.')
  )
}
function rollupOptions(config: ConfigRecord, path: string) {
  config.rolldownOptions ??= config.rollupOptions
  const warn = path === 'optimizeDeps' || path === 'ssr.optimizeDeps'
  if (
    warn &&
    config.rollupOptions &&
    config.rolldownOptions !== config.rollupOptions
  ) {
    warnRollupOptions()
  }
  Object.defineProperty(config, 'rollupOptions', {
    get: () => config.rolldownOptions,
    set(value) {
      if (warn) warnRollupOptions()
      config.rolldownOptions = value
    },
    configurable: true,
    enumerable: true,
  })
}
function environmentOptions(value: unknown): unknown {
  if (!object(value)) return value
  const config = { ...value }
  if (object(config.build)) rollupOptions(config.build, 'build')
  return config
}

const wsOptionKeys = [
  'protocol',
  'host',
  'port',
  'clientPort',
  'path',
  'timeout',
  'server',
]
let warnedHmrOptions = false
function warnHmrOptions() {
  if (warnedHmrOptions) return
  warnedHmrOptions = true
  const trace = process.env.VITE_DEPRECATION_TRACE
  console[trace ? 'trace' : 'warn'](
    '`server.hmr.protocol/host/port/path/clientPort/timeout/server` is deprecated. Use `server.ws.*` instead. Note that this option may be set by a plugin. ' +
      (trace
        ? 'Showing trace because VITE_DEPRECATION_TRACE is set.'
        : 'Set VITE_DEPRECATION_TRACE=1 to see where it is called.')
  )
}
function hmrOptions(config: ConfigRecord) {
  if (config.hmr === false || config.ws === false) return
  if (config.hmr === true) config.hmr = {}
  const hmr = config.hmr
  const ws = config.ws ? { ...config.ws } : {}
  if (hmr) {
    for (const key of wsOptionKeys) {
      if (hmr[key] !== undefined) ws[key] ??= hmr[key]
    }
  }
  config.ws = ws
  const proxy = { ...hmr }
  for (const key of wsOptionKeys) {
    Object.defineProperty(proxy, key, {
      get: () => config.ws?.[key],
      set(value) {
        warnHmrOptions()
        if (typeof config.ws === 'object') config.ws[key] = value
      },
      configurable: true,
      enumerable: true,
    })
  }
  config.hmr = proxy
}

/** Config merge behavior is independent of compilation and controller startup. */
export function mergeConfig<D extends ConfigRecord, O extends ConfigRecord>(
  defaults: D extends Function ? never : D,
  overrides: O extends Function ? never : O,
  isRoot = true
): ConfigRecord {
  if (typeof defaults === 'function' || typeof overrides === 'function') {
    throw new Error('Cannot merge config in form of callback')
  }
  function merge(
    base: ConfigRecord,
    extra: ConfigRecord,
    path: string
  ): ConfigRecord {
    const result = { ...base }
    if (rollupOptionsPaths.has(path)) rollupOptions(result, path)
    if (path === 'server') hmrOptions(result)
    if (path === 'server.hmr') {
      for (const key of wsOptionKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(base, key)
        if (descriptor) Object.defineProperty(result, key, descriptor)
      }
    }
    for (const key in extra) {
      const value = extra[key]
      if (value == null) continue
      let previous = result[key]
      if (key === 'rollupOptions' && rollupOptionsPaths.has(path)) {
        if (extra.rolldownOptions) continue
        previous = result.rolldownOptions
      }
      if (previous == null) {
        if (path === '' && key === 'environments' && object(value)) {
          result[key] = Object.fromEntries(
            Object.entries(value).map(([name, env]) => [
              name,
              environmentOptions(env),
            ])
          )
        } else {
          result[key] =
            path === 'environments' ? environmentOptions(value) : value
        }
      } else if (key === 'input' && path === '') {
        result[key] = mergeInput(previous, value)
      } else if (key === 'alias' && (path === 'resolve' || path === '')) {
        result[key] = !previous
          ? value
          : !value
            ? previous
            : object(previous) && object(value)
              ? { ...previous, ...value }
              : [...aliases(value), ...aliases(previous)]
      } else if (key === 'assetsInclude' && path === '') {
        result[key] = [].concat(previous, value)
      } else if (
        (((key === 'noExternal' || key === 'external') &&
          (path === 'ssr' || path === 'resolve')) ||
          (key === 'allowedHosts' && path === 'server')) &&
        (previous === true || value === true)
      ) {
        result[key] = true
      } else if (key === 'plugins' && path === 'worker') {
        const plugins = (entry: any) =>
          Array.isArray(entry)
            ? entry
            : typeof entry === 'function'
              ? entry()
              : []
        result[key] = () => [...plugins(previous), ...plugins(value)]
      } else if (
        key === 'server' &&
        (path === 'server.hmr' || path === 'server.ws')
      ) {
        result[key] = value
      } else if (Array.isArray(previous) || Array.isArray(value)) {
        result[key] = [...array(previous), ...array(value)]
      } else if (object(previous) && object(value)) {
        result[key] = merge(
          previous,
          value,
          path && !/^environments\.[^.]+$/.test(path) ? `${path}.${key}` : key
        )
      } else {
        result[key] = value
      }
    }
    return result
  }
  return merge(defaults, overrides, isRoot ? '' : '.')
}
