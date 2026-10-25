import type { CompilerAliases } from './compiler/aliases'
import { parseCustomCoverageConfig } from './coverage/custom-options'
import type { CustomCoverageConfig } from './coverage/custom-types'
import { parseProjectStandardCoverage } from './coverage/options'
import { applyCoverageProviderOverride } from './coverage/provider-override'
import type { ProjectStandardCoverageConfig } from './coverage/types'
import { validateOptions, type TestOptions } from './runner/collector'
import type { TestTagDefinition } from './runner/tasks'
import {
  inheritGlobalTestSequence,
  type TestSequenceOptions,
} from './runner/sequence'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import type {
  BrowserViewport,
  TestBrowserEngine,
  RegisteredBrowserFixture,
  TestProfile,
} from './contracts'
import { parseMaxWorkers } from './scheduling'
import { assignBrowserInstanceIds } from './browser-instances'
import { openTestConfigModule, openTestProjectModules } from './config-modules'
import type { FakeTimerOptions } from './assertions/utilities'
import type { TestTypecheckConfig } from './typecheck'
import { parseTestTypecheckConfig } from './typecheck'
import { parseExecutionEnvironment } from './environments/config'
import type { TestExecutionEnvironment } from './contracts'

export interface TestProjectConfig {
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
  compatibility: 'vitest'
  maxWorkers: number
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
  authoredNames?: readonly (string | undefined)[]
): TestConfig {
  const config = object(value, 'config')
  keys(
    config,
    ['compatibility', 'projects', 'maxWorkers', 'testNamePattern', 'cache'],
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
    { browser: TestBrowserEngine; name?: string }[]
  >()
  const normalized: TestConfig = {
    compatibility: 'vitest',
    ...(cache === undefined ? {} : { cache }),
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
          ['enabled', 'viewport', 'instances', 'headless'],
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
            keys(instance, ['browser', 'name'], instanceLabel)
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
            return instance.name === undefined
              ? { browser: instance.browser }
              : { browser: instance.browser, name: instance.name as string }
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
        if (!browserClient)
          invalid(
            `${label}.env currently requires a development Browser client project.`
          )
        const configured = object(project.env, `${label}.env`)
        for (const [envName, envValue] of Object.entries(configured)) {
          if (typeof envValue !== 'string')
            invalid(`${label}.env.${envName} must be a string.`)
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
  const { projects, maxWorkers, name, cache, ...defaults } = test
  const rootSequence = object(test.sequence ?? {}, 'test.sequence')
  const sequenceSeed = rootSequence.seed ?? Date.now()
  defaults.sequence = { ...rootSequence, seed: sequenceSeed }
  if (projects === undefined) {
    const normalized = parseTestConfig(
      {
        maxWorkers,
        cache,
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
      cache,
      projects: projects.map((projectValue, index) => {
        const project = object(projectValue, `test.projects[${index}]`)
        const settings =
          'test' in project
            ? (keys(project, ['test'], `test.projects[${index}]`),
              object(project.test, `test.projects[${index}].test`))
            : project
        return {
          ...defaults,
          ...settings,
          name: settings.name ?? `project-${index}`,
          sequence: inheritGlobalTestSequence(
            {
              ...object(defaults.sequence, 'test.sequence'),
              ...object(
                settings.sequence ?? {},
                `test.projects[${index}].sequence`
              ),
            } as TestSequenceOptions,
            defaults.sequence as TestSequenceOptions
          ),
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
    })
  )
}

/** Next config takes precedence, then Vitest, then Vite's test configuration. */
async function testConfigSource(projectDir: string) {
  const files = await readdir(projectDir)
  for (const prefix of ['next.test', 'vitest', 'vite']) {
    const selected = files
      .filter((file) =>
        new RegExp(
          `^${prefix.replaceAll('.', '\\.')}\\.config\\.(?:[cm]?[jt]s|json)$`
        ).test(file)
      )
      .sort()
    if (selected.length > 1)
      throw new Error(
        `Ambiguous test configuration: ${selected.join(', ')}. Keep one configuration per precedence level.`
      )
    if (selected.length) return path.join(projectDir, selected[0])
  }
}

export async function openTestConfiguration(
  projectDir: string,
  signal?: AbortSignal,
  coverageProvider?: 'v8'
) {
  const filename = await testConfigSource(projectDir)
  const sourceBytes = filename ? await readFile(filename) : undefined
  let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
  let projectModules:
    | Awaited<ReturnType<typeof openTestProjectModules>>
    | undefined
  let disposing: Promise<void> | undefined
  let retainedTransforms = false
  let globalSetupLifetime: AbortSignal | undefined
  let retainedSetupContexts: Record<string, Record<string, unknown>> | undefined
  let globalSetupRetentionInvalid = false
  function dispose() {
    return (disposing ??= (async () => {
      const failures: unknown[] = []
      // The pinned runner tears down the root first, then child projects in
      // reverse order. Keep configuration services alive through every teardown.
      if (projectModules && !signal?.aborted) {
        for (const resource of [realm, projectModules]) {
          try {
            await resource?.teardown()
          } catch (error) {
            failures.push(error)
          }
        }
      }
      for (const resource of [projectModules, realm]) {
        try {
          await resource?.dispose()
        } catch (error) {
          failures.push(error)
        }
      }
      if (failures.length === 1) throw failures[0]
      if (failures.length) {
        throw new AggregateError(failures, 'Test configuration cleanup failed.')
      }
    })())
  }
  try {
    let value: unknown = {}
    if (filename?.endsWith('.json')) {
      try {
        value = JSON.parse(await readFile(filename, 'utf8'))
      } catch {
        invalid('The file must contain valid JSON.')
      }
    } else if (filename) {
      realm = await openTestConfigModule(filename, projectDir, signal)
      value = realm.value
    }
    value = applyCoverageProviderOverride(value, coverageProvider)
    const normalize = coverageProvider
      ? (project: unknown) =>
          normalizeTestConfig(
            applyCoverageProviderOverride(project, coverageProvider)
          )
      : normalizeTestConfig
    projectModules = await openTestProjectModules(
      value,
      projectDir,
      normalize,
      signal
    )
    const config = projectModules?.config ?? normalize(value)
    if (realm?.compilerAliases) {
      if (
        projectModules &&
        config.projects.some((project) => projectModules!.owns(project))
      )
        invalid(
          'Root resolve.alias inheritance into external project configurations is not implemented; configure each project mapping explicitly.'
        )
      for (const project of config.projects)
        project.compilerAliases = realm.compilerAliases
    }
    function compilerInputsForProjects(projects: readonly TestProjectConfig[]) {
      const usesRoot = projects.some(
        (project) => !projectModules?.owns(project)
      )
      return [
        ...new Set([
          ...(usesRoot ? (realm?.compilerTransformInputs ?? []) : []),
          ...(usesRoot ? (realm?.compilerAliases?.inputs ?? []) : []),
          ...(projectModules?.compilerInputsForProjects(projects) ?? []),
        ]),
      ]
    }
    return {
      config,
      /** The root configuration selected for this invocation. */
      coverageConfigurationFile: filename,
      ...(realm?.prepareCoverageThresholdUpdate
        ? {
            prepareCoverageThresholdUpdate:
              realm.prepareCoverageThresholdUpdate,
          }
        : {}),
      ...(realm?.formatCoverageThresholdUpdates
        ? {
            formatCoverageThresholdUpdates:
              realm.formatCoverageThresholdUpdates,
          }
        : {}),
      /** Root transform closures follow the watch service across ordinary runs. */
      async retainCompilerTransformsForWatch(
        lifetime: AbortSignal,
        requireCurrent = false
      ) {
        if (
          !realm?.compilerTransform ||
          projectModules ||
          config.projects.some((project) => project.globalSetup?.length)
        )
          return false
        const selected = await testConfigSource(projectDir)
        const current =
          selected === filename &&
          (await readFile(filename!)).equals(sourceBytes!)
        if (!current) {
          if (requireCurrent)
            throw new Error(
              'Test compiler configuration changed during evaluation.'
            )
          return false
        }
        realm.retainCompilerTransformsForWatch(lifetime)
        retainedTransforms = true
        return true
      },
      /** The qualified root JSON global setup follows the watch session. */
      async retainGlobalSetupForWatch(
        lifetime: AbortSignal,
        projects: readonly TestProjectConfig[],
        requireCurrent = false,
        requireFulfilled = false
      ) {
        const project = projects[0]
        if (
          !filename?.endsWith('.json') ||
          projectModules ||
          config.projects.length !== 1 ||
          projects.length !== 1 ||
          project.profile.id !== config.projects[0].profile.id ||
          !project.globalSetup?.length ||
          project.globalSetup.length !==
            config.projects[0].globalSetup?.length ||
          project.globalSetup.some(
            (file, index) => file !== config.projects[0].globalSetup?.[index]
          ) ||
          project.profile.mode !== 'development' ||
          project.profile.environment !== 'node' ||
          project.profile.runtime !== 'nodejs' ||
          project.profile.bundler !== 'turbopack' ||
          project.profile.route !== undefined ||
          project.isolate === false ||
          (project.executionEnvironment &&
            project.executionEnvironment.name !== 'node') ||
          project.customCoverage ||
          globalSetupRetentionInvalid
        )
          return false
        if (requireFulfilled && !retainedSetupContexts) return false
        if (!retainedSetupContexts && signal?.aborted) {
          globalSetupRetentionInvalid = true
          return false
        }
        const selected = await testConfigSource(projectDir)
        if (
          selected !== filename ||
          !(await readFile(filename)).equals(sourceBytes!)
        ) {
          if (requireCurrent)
            throw new Error(
              'Test global setup configuration changed during evaluation.'
            )
          return false
        }
        if (disposing)
          throw new Error(
            'The retained global setup configuration is unavailable.'
          )
        lifetime.throwIfAborted()
        // Before the initial setup fulfills its realm remains generation-owned.
        // A cancelled or partially failed setup must not survive that generation.
        if (retainedSetupContexts) realm!.retainForWatch(lifetime)
        globalSetupLifetime = lifetime
        return true
      },
      compilerTransformNames: [
        ...(realm?.compilerTransformNames ?? []),
        ...(projectModules?.compilerTransformNames ?? []),
      ],
      compilerTransforms(projects: readonly TestProjectConfig[]) {
        return Object.fromEntries(
          projects.flatMap((project) => {
            const descriptor = projectModules?.owns(project)
              ? projectModules.compilerTransform(project)
              : realm?.compilerTransform
            return descriptor ? [[project.profile.id, descriptor]] : []
          })
        )
      },
      compilerInputsForProjects,
      /** Compiler dependencies of all configured project owners. */
      get compilerInputs() {
        return compilerInputsForProjects(config.projects)
      },
      /** Private watch identities; imported config dependencies still widen. */
      get watchInputs() {
        return [
          ...(filename ? [filename] : []),
          ...(realm?.compilerTransformInputs ?? []),
          ...(realm?.compilerAliases?.inputs ?? []),
          ...(projectModules?.watchInputs ?? []),
          ...(projectModules?.rootProject.globalSetup ?? []).map((file) =>
            path.resolve(projectDir, file)
          ),
        ]
      },
      watchRootProject: projectModules?.rootProject,
      async setup(
        projects: TestProjectConfig[],
        generationSignal?: AbortSignal
      ) {
        if (
          globalSetupLifetime &&
          projects.some(
            (project) => project.profile.id !== config.projects[0].profile.id
          )
        )
          throw new Error(
            'Unknown project in retained global setup configuration.'
          )
        if (
          globalSetupLifetime &&
          projects.length &&
          (projects.length !== 1 ||
            !projects[0].globalSetup?.length ||
            projects[0].globalSetup.length !==
              config.projects[0].globalSetup?.length ||
            projects[0].globalSetup.some(
              (file, index) => file !== config.projects[0].globalSetup?.[index]
            ) ||
            projects[0].profile.mode !== 'development' ||
            projects[0].profile.environment !== 'node' ||
            projects[0].profile.runtime !== 'nodejs' ||
            projects[0].profile.bundler !== 'turbopack' ||
            projects[0].profile.route !== undefined ||
            projects[0].isolate === false ||
            (projects[0].executionEnvironment &&
              projects[0].executionEnvironment.name !== 'node') ||
            projects[0].customCoverage)
        ) {
          globalSetupRetentionInvalid = true
          globalSetupLifetime = undefined
          if (retainedSetupContexts)
            throw new Error(
              'Unsupported project in retained global setup configuration.'
            )
        }
        if (retainedSetupContexts) {
          if (disposing || globalSetupRetentionInvalid)
            throw new Error(
              'The retained global setup configuration is unavailable.'
            )
          globalSetupLifetime!.throwIfAborted()
          realm!.retainForWatch(globalSetupLifetime!)
          for (const project of projects) {
            if (!Object.hasOwn(retainedSetupContexts, project.profile.id))
              throw new Error(
                'Unknown project in retained global setup configuration.'
              )
            project.provide = structuredClone(
              retainedSetupContexts[project.profile.id]
            )
          }
          return
        }
        if (retainedTransforms) {
          // This owner admits no global setup or external project realm. Provide
          // fresh cloned context per run without repeating the worker setup RPC.
          for (const project of projects) {
            const declared = config.projects.find(
              (candidate) => candidate.profile.id === project.profile.id
            )
            if (!declared)
              throw new Error(
                'Unknown project in retained compiler configuration.'
              )
            project.provide = structuredClone(declared.provide ?? {})
          }
          return
        }
        try {
          const initialSetupSignal = generationSignal ?? signal
          if (globalSetupLifetime) initialSetupSignal?.throwIfAborted()
          let rootContext = projectModules?.rootProject.provide ?? {}
          const selected = projects.map((project) => ({
            name: project.profile.id,
            provide: project.provide ?? {},
            ...(projectModules ? { inheritedProvide: rootContext } : {}),
            globalSetup: (project.globalSetup ?? []).map((file) =>
              path.resolve(projectDir, file)
            ),
          }))
          if (!realm && selected.some((project) => project.globalSetup.length))
            realm = await openTestConfigModule(
              undefined,
              projectDir,
              globalSetupLifetime ? initialSetupSignal : signal
            )
          const rootSelected = projectModules
            ? selected.filter(
                (_, index) => !projectModules!.owns(projects[index])
              )
            : selected
          const contexts =
            realm && rootSelected.length
              ? await realm.setup(rootSelected)
              : Object.fromEntries(
                  rootSelected.map((project) => [
                    project.name,
                    structuredClone(project.provide),
                  ])
                )
          if (projectModules) {
            Object.assign(contexts, await projectModules.setup(selected))
            if (projects.length) {
              realm ??= await openTestConfigModule(
                undefined,
                projectDir,
                signal
              )
              rootContext = await realm.setupRoot({
                ...projectModules.rootProject,
                globalSetup: projectModules.rootProject.globalSetup.map(
                  (file) => path.resolve(projectDir, file)
                ),
              })
            }
            for (const project of projects) {
              contexts[project.profile.id] = {
                ...rootContext,
                ...contexts[project.profile.id],
              }
            }
          }
          for (const project of projects)
            project.provide = contexts[project.profile.id]
          if (globalSetupLifetime && projects.length) {
            initialSetupSignal?.throwIfAborted()
            globalSetupLifetime.throwIfAborted()
            const retained = structuredClone(contexts)
            realm!.retainForWatch(globalSetupLifetime)
            retainedSetupContexts = retained
          }
        } catch (error) {
          if (globalSetupLifetime) globalSetupRetentionInvalid = true
          throw error
        }
      },
      dispose,
    }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Test configuration and cleanup failed.'
      )
    }
    throw error
  }
}

export async function loadTestConfig(projectDir: string): Promise<TestConfig> {
  const session = await openTestConfiguration(projectDir)
  try {
    if (session.compilerTransformNames.length)
      invalid(
        `Unsupported setting config.plugins (${session.compilerTransformNames.join(', ')}). Configure equivalent application transforms through next.config compiler rules or retain openTestConfiguration through compilation; loadTestConfig cannot own executable compiler hooks.`
      )
    return session.config
  } finally {
    await session.dispose()
  }
}
