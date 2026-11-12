import {
  parseSnapshotFormat,
  preflightProjectSnapshotFormat,
  type SnapshotFormat,
} from './snapshot-format'
import type { CompilerAliases } from './compiler/aliases'
import { parseCustomCoverageConfig } from './coverage/custom-options'
import {
  parseConfiguredReporters,
  parseConfiguredOutputFile,
  type ResultOutputFile,
} from './reporting/options'
import type { CustomCoverageConfig } from './coverage/custom-types'
import { parseProjectStandardCoverage } from './coverage/options'
import type { ProjectStandardCoverageConfig } from './coverage/types'
import { validateOptions, type TestOptions } from './runner/collector'
import type { TestTagDefinition } from './runner/tasks'
import {
  inheritGlobalTestSequence,
  type TestSequenceOptions,
} from './runner/sequence'
import type {
  BrowserViewport,
  TestBrowserEngine,
  RegisteredBrowserFixture,
  TestProfile,
} from './contracts'
import { parseMaxWorkers } from './scheduling'
import { assignBrowserInstanceIds } from './browser-instances'
import type { FakeTimerOptions } from './assertions/utilities'
import type { TestTypecheckConfig } from './typecheck'
import { parseTestTypecheckConfig } from './typecheck'
import { parseExecutionEnvironment } from './environments/config'
import type { TestExecutionEnvironment } from './contracts'

export interface TestProjectConfig {
  /** Private inline-project compiler adapter policy; authored keys cannot supply it. */
  compilerRootInheritance?: false
  /** Private evaluated config mapping; raw public test settings cannot supply it. */
  compilerAliases?: CompilerAliases
  customCoverage?: CustomCoverageConfig
  standardCoverage?: ProjectStandardCoverageConfig
  executionEnvironment?: TestExecutionEnvironment
  /** Explicit author name, distinct from the internal unnamed profile ID. */
  displayName?: string
  /** Normalized instance selection; never accepted as an authored setting. */
  browserInstance?: { parentName?: string }
  /** Selected enabled Browser Mode engine; authored input uses browser.instances. */
  browserEngine?: TestBrowserEngine
  profile: TestProfile
  isolate?: boolean
  include: string[]
  includeSource?: string[]
  exclude: string[]
  snapshotSerializers?: string[]
  setupFiles: string[]
  globalSetup?: string[]
  globals?: boolean
  includeTaskLocation?: boolean
  provide?: Record<string, unknown>
  env?: Record<string, string>
  browserViewport?: BrowserViewport
  /** Resolved authored data; public types declare html, aria, or all. */
  browserLocatorErrorFormat?: unknown
  browserLocatorTestIdAttribute?: string
  /** Explicit enabled Browser launch mode; omission keeps the existing default. */
  browserHeadless?: boolean
  fakeTimers?: FakeTimerOptions
  clearMocks?: boolean
  mockReset?: boolean
  restoreMocks?: boolean
  unstubGlobals?: boolean
  unstubEnvs?: boolean
  maxConcurrency?: number
  retry?: TestOptions['retry']
  bail?: number
  allowOnly?: boolean
  passWithNoTests?: boolean
  testNamePattern?: string | RegExp
  sequence?: TestSequenceOptions
  browserFixtures?: RegisteredBrowserFixture[]
  tags?: TestTagDefinition[]
  strictTags?: boolean
  attachmentsDir?: string
  testTimeout: number
  hookTimeout: number
  fileTimeout: number
  typecheck?: TestTypecheckConfig
}

export interface TestConfig {
  snapshotFormat?: SnapshotFormat
  reporters?: string[]
  outputFile?: ResultOutputFile
  compatibility: 'vitest'
  /** Root process exit timer; not a file or hook execution deadline. */
  teardownTimeout?: number
  /** Root session mode; project settings do not inherit this selection. */
  watch?: boolean
  /** Root-owned ordinary worker inspection; never inherited by projects. */
  inspect?: boolean | string
  maxWorkers: number
  fileParallelism?: boolean
  cache?: boolean | { dir: string }
  projects: TestProjectConfig[]
}

export type TestConfigOverrides = Partial<
  Pick<
    TestProjectConfig,
    | 'retry'
    | 'bail'
    | 'allowOnly'
    | 'passWithNoTests'
    | 'testTimeout'
    | 'hookTimeout'
    | 'browserHeadless'
    | 'includeTaskLocation'
  >
> & { typecheck?: Partial<TestTypecheckConfig> }

/** CLI values override project defaults, including explicit false and zero. */
export function applyTestConfigOverrides(
  config: TestConfig,
  overrides: TestConfigOverrides
): TestConfig {
  const selected = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  ) as TestConfigOverrides
  const { typecheck, browserHeadless, ...settings } = selected
  return {
    ...config,
    projects: config.projects.map((project) => {
      const resolved = {
        ...project,
        ...settings,
        ...(browserHeadless === undefined || !project.profile.browserClient
          ? {}
          : { browserHeadless }),
      }
      return {
        ...resolved,
        ...(typecheck === undefined
          ? {}
          : {
              typecheck: parseTestTypecheckConfig(
                { ...project.typecheck, ...typecheck },
                'CLI typecheck'
              ),
            }),
        fileTimeout: Math.max(
          project.fileTimeout,
          resolved.testTimeout,
          resolved.hookTimeout
        ),
      }
    }),
  }
}

const configName = 'next.test.config.json'
const defaultPattern = '**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'

function invalid(message: string): never {
  throw new Error(`Invalid ${configName}: ${message}`)
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function browserLocatorErrorFormat(
  value: unknown,
  label: string,
  fallback: unknown
): unknown {
  const locators = value == null ? {} : object(value, label)
  keys(locators, ['errorFormat', 'testIdAttribute'], label)
  const format = locators.errorFormat ?? fallback
  try {
    structuredClone(format)
    JSON.stringify(format)
  } catch {
    invalid(`${label}.errorFormat must contain serializable data.`)
  }
  return format
}

function browserLocatorTestIdAttribute(
  value: unknown,
  label: string,
  fallback?: string
): string | undefined {
  const locators = value == null ? {} : object(value, label)
  const attribute = locators.testIdAttribute
  return (attribute ?? fallback) as string | undefined
}

function keys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      if (
        key === 'resolve' &&
        value.resolve &&
        typeof value.resolve === 'object' &&
        'alias' in value.resolve
      ) {
        const alias = (value.resolve as { alias: unknown }).alias
        const names =
          alias && typeof alias === 'object' && !Array.isArray(alias)
            ? Object.keys(alias)
            : []
        invalid(
          `Unsupported setting ${label}.resolve.alias${names.length ? ` (${names.join(', ')})` : ''}. Map these module specifiers through next.config compiler aliases; Vitest/Vite resolution cannot override the Next application graph.`
        )
      }
      if (key === 'plugins') {
        const names = Array.isArray(value.plugins)
          ? value.plugins.flatMap((plugin) =>
              plugin &&
              typeof plugin === 'object' &&
              typeof plugin.name === 'string'
                ? [plugin.name]
                : []
            )
          : []
        invalid(
          `Unsupported setting ${label}.plugins${names.length ? ` (${names.join(', ')})` : ''}. Configure equivalent application transforms through next.config compiler rules; Vitest/Vite plugins cannot override the Next application graph.`
        )
      }
      invalid(
        `Unsupported setting ${label}.${key}. Application compilation is configured through next.config; test compiler overrides and Vitest/Vite plugins are not supported.`
      )
    }
  }
}

function strings(value: unknown, fallback: string[], label: string): string[] {
  if (value === undefined) return fallback
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    invalid(`${label} must be an array of nonempty strings.`)
  }
  return value as string[]
}

function timeout(
  value: unknown,
  fallback: number,
  label: string,
  allowZero = false
): number {
  if (value === undefined) return fallback
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < (allowZero ? 0 : 1) ||
    value > 2 ** 31 - 1
  ) {
    invalid(
      `${label} must be a ${allowZero ? 'nonnegative' : 'positive'} integer no greater than 2147483647.`
    )
  }
  return value
}

export function parseTestConfig(
  value: unknown,
  authoredNames?: readonly (string | undefined)[],
  compilerRootInheritance?: readonly boolean[]
): TestConfig {
  const config = object(value, 'config')
  keys(
    config,
    [
      'compatibility',
      'reporters',
      'outputFile',
      'snapshotFormat',
      'teardownTimeout',
      'projects',
      'maxWorkers',
      'fileParallelism',
      'watch',
      'inspect',
      'testNamePattern',
      'cache',
    ],
    'config'
  )
  function namePattern(
    patternValue: unknown,
    label: string
  ): string | RegExp | undefined {
    if (patternValue === undefined) return
    if (typeof patternValue !== 'string' && !(patternValue instanceof RegExp))
      invalid(`${label} must be a string or RegExp.`)
    try {
      new RegExp(patternValue as string | RegExp)
    } catch {
      invalid(`${label} must be a valid regular expression.`)
    }
    return patternValue as string | RegExp
  }
  const defaultNamePattern = namePattern(
    config.testNamePattern,
    'config.testNamePattern'
  )
  if (
    config.fileParallelism !== undefined &&
    typeof config.fileParallelism !== 'boolean'
  )
    invalid('config.fileParallelism must be a boolean.')
  if (config.watch !== undefined && typeof config.watch !== 'boolean')
    invalid('config.watch must be a boolean.')
  if (
    config.teardownTimeout !== undefined &&
    typeof config.teardownTimeout !== 'number'
  )
    invalid('config.teardownTimeout must be a number.')
  if (
    config.inspect !== undefined &&
    typeof config.inspect !== 'boolean' &&
    typeof config.inspect !== 'string'
  )
    invalid('config.inspect must be a boolean or string.')
  let cache: TestConfig['cache']
  if (config.cache !== undefined) {
    if (typeof config.cache === 'boolean') cache = config.cache
    else {
      const legacy = object(config.cache, 'config.cache')
      keys(legacy, ['dir'], 'config.cache')
      if (typeof legacy.dir !== 'string')
        invalid('config.cache.dir must be a string.')
      cache = { dir: legacy.dir }
    }
  }
  if (config.compatibility !== undefined && config.compatibility !== 'vitest') {
    invalid('compatibility must be "vitest".')
  }
  const projects =
    config.projects === undefined
      ? [{ name: 'default', environment: 'node' }]
      : config.projects
  if (!Array.isArray(projects) || projects.length === 0) {
    invalid('projects must be a nonempty array.')
  }
  const names = new Set<string>()
  const instances = new Map<
    number,
    {
      browser: TestBrowserEngine
      name?: string
      browserLocatorErrorFormat?: unknown
      browserLocatorTestIdAttribute?: string
    }[]
  >()
  const normalized: TestConfig = {
    ...parseConfiguredReporters(config.reporters),
    ...parseConfiguredOutputFile(config.outputFile),
    ...(config.snapshotFormat === undefined
      ? {}
      : { snapshotFormat: parseSnapshotFormat(config.snapshotFormat) }),
    compatibility: 'vitest',
    ...(config.teardownTimeout === undefined
      ? {}
      : {
          teardownTimeout: config.teardownTimeout as number,
        }),
    ...(config.watch === undefined ? {} : { watch: config.watch as boolean }),
    ...(config.inspect === undefined
      ? {}
      : { inspect: config.inspect as boolean | string }),
    ...(cache === undefined ? {} : { cache }),
    ...(config.fileParallelism === undefined
      ? {}
      : { fileParallelism: config.fileParallelism as boolean }),
    maxWorkers: parseMaxWorkers(
      config.maxWorkers === undefined ? 1 : config.maxWorkers
    ),
    projects: projects.map((projectValue, index) => {
      const label = `projects[${index}]`
      const project = object(projectValue, label)
      keys(
        project,
        [
          'name',
          'environment',
          'environmentOptions',
          'mode',
          'include',
          'includeSource',
          'exclude',
          'route',
          'setupFiles',
          'snapshotSerializers',
          // Vitest ignores this root-owned option in child configurations.
          'snapshotFormat',
          // Vitest ignores this root-owned option in child configurations.
          'teardownTimeout',
          'globalSetup',
          'globals',
          'includeTaskLocation',
          'provide',
          'env',
          'fakeTimers',
          'clearMocks',
          'mockReset',
          'restoreMocks',
          'unstubGlobals',
          'unstubEnvs',
          'sequence',
          'maxConcurrency',
          'retry',
          'bail',
          'allowOnly',
          'passWithNoTests',
          'testNamePattern',
          'testTimeout',
          'hookTimeout',
          'fileTimeout',
          'browserFixtures',
          'browser',
          'tags',
          'strictTags',
          'attachmentsDir',
          'coverage',
          'typecheck',
          'isolate',
        ],
        label
      )
      preflightProjectSnapshotFormat(project.snapshotFormat)
      if (project.isolate !== undefined && typeof project.isolate !== 'boolean')
        invalid(`${label}.isolate must be a boolean.`)
      const standardCoverage = parseProjectStandardCoverage(project.coverage)
      const customCoverage = standardCoverage
        ? undefined
        : parseCustomCoverageConfig(project.coverage)
      const name = project.name
      const browser =
        project.browser === undefined
          ? undefined
          : object(project.browser, `${label}.browser`)
      if (browser) {
        keys(
          browser,
          ['enabled', 'viewport', 'instances', 'headless', 'locators'],
          `${label}.browser`
        )
        if (typeof browser.enabled !== 'boolean')
          invalid(`${label}.browser.enabled must be a boolean.`)
        if (
          browser.headless !== undefined &&
          typeof browser.headless !== 'boolean'
        )
          invalid(`${label}.browser.headless must be a boolean.`)
      }
      const browserClient = browser?.enabled === true
      const resolvedBrowserLocatorErrorFormat = browserClient
        ? browserLocatorErrorFormat(
            browser.locators,
            `${label}.browser.locators`,
            'all'
          )
        : undefined
      const resolvedBrowserLocatorTestIdAttribute = browserClient
        ? browserLocatorTestIdAttribute(
            browser.locators,
            `${label}.browser.locators`
          )
        : undefined
      const expandsBrowserInstances =
        browserClient && browser.instances !== undefined
      if (
        typeof name !== 'string' ||
        (!expandsBrowserInstances && !/^[a-zA-Z0-9_-]+$/.test(name))
      ) {
        invalid(`${label}.name must contain only letters, digits, "_" or "-".`)
      }
      if (names.has(name)) invalid(`Duplicate project name "${name}".`)
      names.add(name)
      if (expandsBrowserInstances) {
        if (!Array.isArray(browser.instances) || browser.instances.length === 0)
          invalid(`${label}.browser.instances must be a nonempty array.`)
        instances.set(
          index,
          browser.instances.map((instanceValue, instanceIndex) => {
            const instanceLabel = `${label}.browser.instances[${instanceIndex}]`
            const instance = object(instanceValue, instanceLabel)
            keys(instance, ['browser', 'name', 'locators'], instanceLabel)
            if (
              instance.browser !== 'chromium' &&
              instance.browser !== 'firefox' &&
              instance.browser !== 'webkit'
            )
              invalid(
                `${instanceLabel}.browser must be Chromium, Firefox, or WebKit.`
              )
            if (
              instance.name !== undefined &&
              typeof instance.name !== 'string'
            )
              invalid(`${instanceLabel}.name must be a string.`)
            const instanceTestIdAttribute = browserLocatorTestIdAttribute(
              instance.locators,
              `${instanceLabel}.locators`,
              resolvedBrowserLocatorTestIdAttribute
            )
            return {
              browser: instance.browser,
              ...(instanceTestIdAttribute === undefined
                ? {}
                : { browserLocatorTestIdAttribute: instanceTestIdAttribute }),
              ...(instance.name === undefined
                ? {}
                : { name: instance.name as string }),
              browserLocatorErrorFormat: browserLocatorErrorFormat(
                instance.locators,
                `${instanceLabel}.locators`,
                resolvedBrowserLocatorErrorFormat
              ),
            }
          })
        )
      }
      let browserViewport: BrowserViewport | undefined
      if (browserClient) {
        const viewport =
          browser.viewport == null
            ? {}
            : object(browser.viewport, `${label}.browser.viewport`)
        keys(viewport, ['width', 'height'], `${label}.browser.viewport`)
        const dimension = (key: 'width' | 'height', fallback: number) => {
          const dimensionValue = viewport[key] ?? fallback
          if (
            typeof dimensionValue !== 'number' ||
            !Number.isInteger(dimensionValue) ||
            dimensionValue < 0
          )
            invalid(
              `${label}.browser.viewport.${key} must be a non-negative integer.`
            )
          return dimensionValue as number
        }
        browserViewport = {
          width: dimension('width', 414),
          height: dimension('height', 896),
        }
      }
      const environment =
        project.environment === undefined
          ? browserClient
            ? 'browser'
            : 'node'
          : project.environment
      const executionEnvironment = parseExecutionEnvironment(
        environment,
        project.environmentOptions,
        label
      )
      const includeSource =
        project.includeSource === undefined
          ? undefined
          : strings(project.includeSource, [], `${label}.includeSource`)
      if (includeSource?.length && environment !== 'node')
        invalid(
          `${label}.includeSource currently requires a fresh Node file profile. RSC, browser and shared worker in-source execution remain unqualified.`
        )
      const mode = project.mode === undefined ? 'development' : project.mode
      if (mode !== 'development' && mode !== 'production') {
        invalid(`${label}.mode must be "development" or "production".`)
      }
      if (
        project.route !== undefined &&
        (typeof project.route !== 'string' || !project.route.startsWith('/'))
      ) {
        invalid(`${label}.route must be an absolute route pathname.`)
      }
      if (
        browserClient &&
        (environment !== 'browser' ||
          project.route !== undefined ||
          project.isolate === false ||
          includeSource?.length ||
          project.browserFixtures !== undefined)
      )
        invalid(
          `${label}.browser.enabled requires an isolated client profile without routes, in-source tests or application fixtures.`
        )
      let browserFixtures: RegisteredBrowserFixture[] | undefined
      if (project.browserFixtures !== undefined) {
        if (environment !== 'browser') {
          invalid(`${label}.browserFixtures requires a browser project.`)
        }
        if (!Array.isArray(project.browserFixtures)) {
          invalid(`${label}.browserFixtures must be an array.`)
        }
        const ids = new Set<string>()
        browserFixtures = project.browserFixtures.map(
          (fixtureValue, fixtureIndex) => {
            const fixtureLabel = `${label}.browserFixtures[${fixtureIndex}]`
            const fixture = object(fixtureValue, fixtureLabel)
            keys(
              fixture,
              ['id', 'module', 'exportName', 'layout'],
              fixtureLabel
            )
            if (
              typeof fixture.id !== 'string' ||
              !/^[a-zA-Z0-9_-]+$/.test(fixture.id)
            ) {
              invalid(
                `${fixtureLabel}.id must contain only letters, digits, "_" or "-".`
              )
            }
            if (ids.has(fixture.id))
              invalid(`Duplicate browser fixture ID "${fixture.id}".`)
            ids.add(fixture.id)
            if (
              typeof fixture.module !== 'string' ||
              fixture.module.trim() === ''
            ) {
              invalid(`${fixtureLabel}.module must be a nonempty path.`)
            }
            const exportName =
              fixture.exportName === undefined ? 'default' : fixture.exportName
            if (
              typeof exportName !== 'string' ||
              !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(exportName)
            ) {
              invalid(
                `${fixtureLabel}.exportName must be a JavaScript identifier.`
              )
            }
            const layout = fixture.layout
            if (
              layout !== undefined &&
              (typeof layout !== 'string' || layout.trim() === '')
            ) {
              invalid(`${fixtureLabel}.layout must be a nonempty path.`)
            }
            return {
              id: fixture.id,
              module: fixture.module,
              exportName,
              ...(layout === undefined ? {} : { layout }),
            }
          }
        )
      }
      let tags: TestTagDefinition[] | undefined
      if (project.tags !== undefined) {
        if (!Array.isArray(project.tags))
          invalid(`${label}.tags must be an array.`)
        tags = project.tags.map((tagValue, tagIndex) => {
          const tag = object(tagValue, `${label}.tags[${tagIndex}]`)
          const { name: tagName, description, priority, ...tagOptions } = tag
          if (typeof tagName !== 'string')
            invalid(`${label}.tags[${tagIndex}].name must be a string.`)
          if (description !== undefined && typeof description !== 'string')
            invalid(`${label}.tags[${tagIndex}].description must be a string.`)
          if (
            priority !== undefined &&
            (typeof priority !== 'number' || !Number.isFinite(priority))
          )
            invalid(
              `${label}.tags[${tagIndex}].priority must be a finite number.`
            )
          validateOptions(tagOptions)
          return tag as unknown as TestTagDefinition
        })
      }
      if (
        project.strictTags !== undefined &&
        typeof project.strictTags !== 'boolean'
      )
        invalid(`${label}.strictTags must be a boolean.`)
      if (
        project.attachmentsDir !== undefined &&
        typeof project.attachmentsDir !== 'string'
      )
        invalid(`${label}.attachmentsDir must be a string.`)
      if (
        project.includeTaskLocation !== undefined &&
        typeof project.includeTaskLocation !== 'boolean'
      )
        invalid(`${label}.includeTaskLocation must be a boolean.`)
      if (project.globals !== undefined && typeof project.globals !== 'boolean')
        invalid(`${label}.globals must be a boolean.`)
      for (const option of ['allowOnly', 'passWithNoTests'] as const) {
        if (
          project[option] !== undefined &&
          typeof project[option] !== 'boolean'
        )
          invalid(`${label}.${option} must be a boolean.`)
      }
      if (project.retry !== undefined)
        validateOptions({ retry: project.retry as TestOptions['retry'] })
      if (
        project.bail !== undefined &&
        (!Number.isSafeInteger(project.bail) || (project.bail as number) < 0)
      )
        invalid(`${label}.bail must be a nonnegative safe integer.`)
      let env: Record<string, string> | undefined
      if (project.env !== undefined) {
        if (
          !browserClient &&
          (environment !== 'node' ||
            project.route !== undefined ||
            project.isolate === false ||
            (executionEnvironment && executionEnvironment.name !== 'node') ||
            customCoverage)
        )
          invalid(
            `${label}.env currently requires an isolated ordinary Node or Browser client project.`
          )
        const configured = object(project.env, `${label}.env`)
        for (const [envName, envValue] of Object.entries(configured)) {
          if (typeof envValue !== 'string')
            invalid(`${label}.env.${envName} must be a string.`)
          if (!browserClient && envName === 'NODE_ENV')
            invalid(
              `${label}.env.NODE_ENV cannot override the compiler-owned Node mode.`
            )
        }
        env = configured as Record<string, string>
      }
      let provide: Record<string, unknown> | undefined
      if (project.provide !== undefined) {
        provide = object(project.provide, `${label}.provide`)
        try {
          structuredClone(provide)
        } catch {
          invalid(`${label}.provide must contain serializable values.`)
        }
      }
      const globalSetup =
        project.globalSetup === undefined
          ? undefined
          : strings(
              typeof project.globalSetup === 'string'
                ? [project.globalSetup]
                : project.globalSetup,
              [],
              `${label}.globalSetup`
            )
      const fakeTimers =
        project.fakeTimers === undefined
          ? undefined
          : object(project.fakeTimers, `${label}.fakeTimers`)
      if (fakeTimers)
        keys(
          fakeTimers,
          [
            'now',
            'toFake',
            'toNotFake',
            'loopLimit',
            'shouldAdvanceTime',
            'advanceTimeDelta',
            'shouldClearNativeTimers',
            'ignoreMissingTimers',
          ],
          `${label}.fakeTimers`
        )
      const resetOptions: Pick<
        TestProjectConfig,
        | 'clearMocks'
        | 'mockReset'
        | 'restoreMocks'
        | 'unstubGlobals'
        | 'unstubEnvs'
      > = {}
      for (const key of [
        'clearMocks',
        'mockReset',
        'restoreMocks',
        'unstubGlobals',
        'unstubEnvs',
      ] as const) {
        if (project[key] === undefined) continue
        if (typeof project[key] !== 'boolean')
          invalid(`${label}.${key} must be a boolean.`)
        resetOptions[key] = project[key] as boolean
      }
      let sequence: TestProjectConfig['sequence']
      if (project.sequence !== undefined) {
        const options = object(project.sequence, `${label}.sequence`)
        keys(
          options,
          ['hooks', 'setupFiles', 'seed', 'shuffle', 'concurrent'],
          `${label}.sequence`
        )
        if (
          options.seed !== undefined &&
          (typeof options.seed !== 'number' || !Number.isFinite(options.seed))
        )
          invalid(`${label}.sequence.seed must be a finite number.`)
        if (
          options.concurrent !== undefined &&
          typeof options.concurrent !== 'boolean'
        )
          invalid(`${label}.sequence.concurrent must be a boolean.`)
        if (
          options.shuffle !== undefined &&
          typeof options.shuffle !== 'boolean'
        ) {
          const shuffle = object(options.shuffle, `${label}.sequence.shuffle`)
          keys(shuffle, ['files', 'tests'], `${label}.sequence.shuffle`)
          for (const key of ['files', 'tests'])
            if (shuffle[key] !== undefined && typeof shuffle[key] !== 'boolean')
              invalid(`${label}.sequence.shuffle.${key} must be a boolean.`)
        }
        if (
          options.hooks !== undefined &&
          options.hooks !== 'stack' &&
          options.hooks !== 'list' &&
          options.hooks !== 'parallel'
        )
          invalid(`${label}.sequence.hooks must be stack, list or parallel.`)
        if (
          options.setupFiles !== undefined &&
          options.setupFiles !== 'list' &&
          options.setupFiles !== 'parallel'
        )
          invalid(`${label}.sequence.setupFiles must be list or parallel.`)
        sequence = options as TestProjectConfig['sequence']
      }
      if (
        project.maxConcurrency !== undefined &&
        (!Number.isSafeInteger(project.maxConcurrency) ||
          (project.maxConcurrency as number) < 1)
      )
        invalid(`${label}.maxConcurrency must be a positive safe integer.`)
      const testTimeout = timeout(
        project.testTimeout,
        5000,
        `${label}.testTimeout`,
        true
      )
      const hookTimeout = timeout(
        project.hookTimeout,
        10000,
        `${label}.hookTimeout`,
        true
      )
      const fileTimeout = timeout(
        project.fileTimeout,
        120000,
        `${label}.fileTimeout`
      )
      if (fileTimeout < Math.max(testTimeout, hookTimeout)) {
        invalid(
          `${label}.fileTimeout must be at least testTimeout and hookTimeout. Increase fileTimeout to accommodate the configured case and hook budgets.`
        )
      }
      return {
        ...(compilerRootInheritance?.[index] === false
          ? { compilerRootInheritance: false as const }
          : {}),
        ...(config.projects === undefined ? {} : { displayName: name }),
        profile: {
          id: name,
          environment: (executionEnvironment
            ? 'node'
            : environment) as TestProfile['environment'],
          mode,
          runtime: 'nodejs',
          bundler: 'turbopack',
          ...(browserClient ? { browserClient: true as const } : {}),
          ...(project.route === undefined
            ? {}
            : { route: project.route as string }),
        },
        ...(project.isolate === undefined
          ? {}
          : { isolate: project.isolate as boolean }),
        ...(executionEnvironment ? { executionEnvironment } : {}),
        ...(customCoverage ? { customCoverage } : {}),
        ...(standardCoverage ? { standardCoverage } : {}),
        include: strings(project.include, [defaultPattern], `${label}.include`),
        ...(includeSource === undefined ? {} : { includeSource }),
        exclude: strings(project.exclude, [], `${label}.exclude`),
        ...(project.snapshotSerializers === undefined
          ? {}
          : {
              snapshotSerializers: strings(
                project.snapshotSerializers,
                [],
                `${label}.snapshotSerializers`
              ),
            }),
        setupFiles: strings(project.setupFiles, [], `${label}.setupFiles`),
        ...(globalSetup === undefined ? {} : { globalSetup }),
        ...(project.globals === undefined
          ? {}
          : { globals: project.globals as boolean }),
        ...(project.includeTaskLocation === undefined
          ? {}
          : { includeTaskLocation: project.includeTaskLocation as boolean }),
        ...(provide === undefined ? {} : { provide }),
        ...(env === undefined ? {} : { env }),
        ...(browserViewport === undefined ? {} : { browserViewport }),
        ...(browserClient
          ? { browserLocatorErrorFormat: resolvedBrowserLocatorErrorFormat }
          : {}),
        ...(resolvedBrowserLocatorTestIdAttribute === undefined
          ? {}
          : {
              browserLocatorTestIdAttribute:
                resolvedBrowserLocatorTestIdAttribute,
            }),
        ...(browserClient && browser.headless !== undefined
          ? { browserHeadless: browser.headless as boolean }
          : {}),
        ...(browserFixtures === undefined ? {} : { browserFixtures }),
        ...(tags === undefined ? {} : { tags }),
        ...(project.strictTags === undefined
          ? {}
          : { strictTags: project.strictTags as boolean }),
        ...(project.attachmentsDir === undefined
          ? {}
          : { attachmentsDir: project.attachmentsDir as string }),
        ...(fakeTimers === undefined
          ? {}
          : { fakeTimers: fakeTimers as FakeTimerOptions }),
        ...resetOptions,
        ...(sequence === undefined ? {} : { sequence }),
        ...(project.maxConcurrency === undefined
          ? {}
          : { maxConcurrency: project.maxConcurrency as number }),
        ...(project.retry === undefined
          ? {}
          : { retry: project.retry as TestOptions['retry'] }),
        ...(project.bail === undefined ? {} : { bail: project.bail as number }),
        ...(project.allowOnly === undefined
          ? {}
          : { allowOnly: project.allowOnly as boolean }),
        ...(project.passWithNoTests === undefined
          ? {}
          : { passWithNoTests: project.passWithNoTests as boolean }),
        ...(project.testNamePattern === undefined &&
        defaultNamePattern === undefined
          ? {}
          : {
              testNamePattern:
                namePattern(
                  project.testNamePattern,
                  `${label}.testNamePattern`
                ) ?? defaultNamePattern,
            }),
        testTimeout,
        hookTimeout,
        fileTimeout,
        ...(project.typecheck === undefined
          ? {}
          : {
              typecheck: parseTestTypecheckConfig(
                project.typecheck,
                `${label}.typecheck`
              ),
            }),
      }
    }),
  }
  normalized.projects = normalized.projects.flatMap((project, index) => {
    const browserInstances = instances.get(index)
    if (!browserInstances) return [project]
    const parentName = authoredNames
      ? authoredNames[index]
      : project.displayName
    return browserInstances.map((instance) => ({
      ...project,
      displayName:
        instance.name ??
        (parentName ? `${parentName} (${instance.browser})` : instance.browser),
      ...(instance.browser === 'firefox' || instance.browser === 'webkit'
        ? { browserEngine: instance.browser }
        : {}),
      browserInstance: parentName === undefined ? {} : { parentName },
      profile: { ...project.profile },
      browserLocatorErrorFormat: instance.browserLocatorErrorFormat,
      ...(instance.browserLocatorTestIdAttribute === undefined
        ? {}
        : {
            browserLocatorTestIdAttribute:
              instance.browserLocatorTestIdAttribute,
          }),
    }))
  })
  assignBrowserInstanceIds(normalized.projects)
  return normalized
}

/** Validate compiler fields in their owning realm, before IPC clones function values. */
export function validateTestConfigCompilerOptions(
  value: unknown,
  context?: { projectConfig: true }
): void {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'test' in value
  ) {
    const config = value as Record<string, unknown>
    keys(config, context?.projectConfig ? ['test', 'root'] : ['test'], 'config')
    if (context?.projectConfig) {
      const test =
        config.test && typeof config.test === 'object'
          ? (config.test as Record<string, unknown>)
          : undefined
      for (const root of [config.root, test?.root])
        if (root !== undefined && typeof root !== 'string')
          invalid('Project configuration root must be a string.')
    }
  }
}

/** Translate test settings; compiler-affecting fields remain explicit errors. */
export function normalizeTestConfig(value: unknown): TestConfig {
  const config = object(value, 'config')
  if (!('test' in config)) return parseTestConfig(config)
  validateTestConfigCompilerOptions(config)
  const test = object(config.test, 'test')
  const {
    projects,
    maxWorkers,
    fileParallelism,
    watch,
    inspect,
    name,
    cache,
    reporters,
    outputFile,
    snapshotFormat,
    teardownTimeout,
    ...defaults
  } = test
  const rootSequence = object(test.sequence ?? {}, 'test.sequence')
  const sequenceSeed = rootSequence.seed ?? Date.now()
  defaults.sequence = { ...rootSequence, seed: sequenceSeed }
  if (projects === undefined) {
    const normalized = parseTestConfig(
      {
        maxWorkers,
        fileParallelism,
        watch,
        inspect,
        cache,
        reporters,
        outputFile,
        snapshotFormat,
        teardownTimeout,
        projects: [{ name: name ?? 'default', ...defaults }],
      },
      [name as string | undefined]
    )
    if (name === undefined && !normalized.projects[0].browserInstance)
      delete normalized.projects[0].displayName
    return normalized
  }
  if (!Array.isArray(projects) || projects.length === 0)
    invalid('test.projects must be a nonempty array of project objects.')
  return parseTestConfig(
    {
      maxWorkers,
      fileParallelism,
      watch,
      inspect,
      cache,
      reporters,
      outputFile,
      snapshotFormat,
      teardownTimeout,
      projects: projects.map((projectValue, index) => {
        const project = object(projectValue, `test.projects[${index}]`)
        const settings =
          'test' in project
            ? (keys(project, ['test', 'extends'], `test.projects[${index}]`),
              object(project.test, `test.projects[${index}].test`))
            : project
        if (
          'test' in project &&
          project.extends !== undefined &&
          typeof project.extends !== 'boolean'
        )
          invalid(`test.projects[${index}].extends must be a boolean.`)
        const inherited = project.extends === false ? {} : defaults
        const inheritedBrowser = object(inherited.browser ?? {}, 'test.browser')
        const projectBrowser = object(
          settings.browser ?? {},
          `test.projects[${index}].browser`
        )
        const inheritedLocators = object(
          inheritedBrowser.locators ?? {},
          'test.browser.locators'
        )
        const projectLocators = object(
          projectBrowser.locators ?? {},
          `test.projects[${index}].browser.locators`
        )
        return {
          ...inherited,
          ...settings,
          ...(inherited.browser !== undefined || settings.browser !== undefined
            ? {
                browser: {
                  ...inheritedBrowser,
                  ...projectBrowser,
                  ...(inheritedBrowser.locators !== undefined ||
                  projectBrowser.locators !== undefined
                    ? {
                        locators: {
                          ...inheritedLocators,
                          ...projectLocators,
                          testIdAttribute:
                            projectLocators.testIdAttribute ??
                            inheritedLocators.testIdAttribute,
                          errorFormat:
                            projectLocators.errorFormat ??
                            inheritedLocators.errorFormat,
                        },
                      }
                    : {}),
                },
              }
            : {}),
          name: settings.name ?? `project-${index}`,
          sequence: inheritGlobalTestSequence(
            {
              ...object(inherited.sequence ?? {}, 'test.sequence'),
              ...object(
                settings.sequence ?? {},
                `test.projects[${index}].sequence`
              ),
            } as TestSequenceOptions,
            defaults.sequence as TestSequenceOptions
          ),
          ...(project.extends !== false &&
          (defaults.setupFiles !== undefined ||
            settings.setupFiles !== undefined)
            ? {
                setupFiles: [
                  ...strings(defaults.setupFiles, [], 'test.setupFiles'),
                  ...strings(
                    settings.setupFiles,
                    [],
                    `test.projects[${index}].setupFiles`
                  ),
                ],
              }
            : {}),
          ...(defaults.env || settings.env
            ? {
                env: {
                  ...object(defaults.env ?? {}, 'test.env'),
                  ...object(settings.env ?? {}, `test.projects[${index}].env`),
                },
              }
            : {}),
          ...(defaults.provide || settings.provide
            ? {
                provide: {
                  ...object(defaults.provide ?? {}, 'test.provide'),
                  ...object(
                    settings.provide ?? {},
                    `test.projects[${index}].provide`
                  ),
                },
              }
            : {}),
        }
      }),
    },
    projects.map((projectValue) => {
      const project = object(projectValue, 'test.projects')
      return (
        'test' in project ? object(project.test, 'test.projects.test') : project
      ).name as string | undefined
    }),
    projects.map(
      (projectValue, index) =>
        object(projectValue, `test.projects[${index}]`).extends !== false
    )
  )
}
