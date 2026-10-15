import { parseCustomCoverageConfig } from './coverage/custom-options'
import type { CustomCoverageConfig } from './coverage/custom-types'
import { validateOptions, type TestOptions } from './runner/collector'
import type { TestTagDefinition } from './runner/tasks'
import {
  inheritGlobalTestSequence,
  type TestSequenceOptions,
} from './runner/sequence'
import { readFile, readdir } from 'fs/promises'
import path from 'path'
import type { RegisteredBrowserFixture, TestProfile } from './contracts'
import { parseMaxWorkers } from './scheduling'
import { openTestConfigModule, openTestProjectModules } from './config-modules'
import type { FakeTimerOptions } from './assertions/utilities'
import type { TestTypecheckConfig } from './typecheck'
import { parseTestTypecheckConfig } from './typecheck'
import { parseExecutionEnvironment } from './environments/config'
import type { TestExecutionEnvironment } from './contracts'

export interface TestProjectConfig {
  customCoverage?: CustomCoverageConfig
  executionEnvironment?: TestExecutionEnvironment
  /** Explicit author name, distinct from the internal unnamed profile ID. */
  displayName?: string
  profile: TestProfile
  isolate?: boolean
  include: string[]
  includeSource?: string[]
  exclude: string[]
  snapshotSerializers?: string[]
  setupFiles: string[]
  globalSetup?: string[]
  globals?: boolean
  provide?: Record<string, unknown>
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
  const { typecheck, ...settings } = selected
  return {
    ...config,
    projects: config.projects.map((project) => {
      const resolved = { ...project, ...settings }
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

export function parseTestConfig(value: unknown): TestConfig {
  const config = object(value, 'config')
  keys(
    config,
    ['compatibility', 'projects', 'maxWorkers', 'testNamePattern'],
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
  return {
    compatibility: 'vitest',
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
          'provide',
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
      const customCoverage = parseCustomCoverageConfig(project.coverage)
      const name = project.name
      if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        invalid(`${label}.name must contain only letters, digits, "_" or "-".`)
      }
      if (names.has(name)) invalid(`Duplicate project name "${name}".`)
      names.add(name)
      const browser =
        project.browser === undefined
          ? undefined
          : object(project.browser, `${label}.browser`)
      if (browser) {
        keys(browser, ['enabled'], `${label}.browser`)
        if (typeof browser.enabled !== 'boolean')
          invalid(`${label}.browser.enabled must be a boolean.`)
      }
      const browserClient = browser?.enabled === true
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
          mode !== 'development' ||
          project.route !== undefined ||
          project.isolate === false ||
          includeSource?.length ||
          project.browserFixtures !== undefined)
      )
        invalid(
          `${label}.browser.enabled requires an isolated one-shot development client profile without routes, in-source tests or application fixtures.`
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
            keys(fixture, ['id', 'module', 'exportName'], fixtureLabel)
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
            return { id: fixture.id, module: fixture.module, exportName }
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
        ...(provide === undefined ? {} : { provide }),
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
}

/** Translate test settings; compiler-affecting fields remain explicit errors. */
export function normalizeTestConfig(value: unknown): TestConfig {
  const config = object(value, 'config')
  if (!('test' in config)) return parseTestConfig(config)
  keys(config, ['test'], 'config')
  const test = object(config.test, 'test')
  const { projects, maxWorkers, name, ...defaults } = test
  const rootSequence = object(test.sequence ?? {}, 'test.sequence')
  const sequenceSeed = rootSequence.seed ?? Date.now()
  defaults.sequence = { ...rootSequence, seed: sequenceSeed }
  if (projects === undefined) {
    const normalized = parseTestConfig({
      maxWorkers,
      projects: [{ name: name ?? 'default', ...defaults }],
    })
    if (name === undefined) delete normalized.projects[0].displayName
    return normalized
  }
  if (!Array.isArray(projects) || projects.length === 0)
    invalid('test.projects must be a nonempty array of project objects.')
  return parseTestConfig({
    maxWorkers,
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
  })
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
  signal?: AbortSignal
) {
  const filename = await testConfigSource(projectDir)
  let realm: Awaited<ReturnType<typeof openTestConfigModule>> | undefined
  let projectModules:
    | Awaited<ReturnType<typeof openTestProjectModules>>
    | undefined
  let disposing: Promise<void> | undefined
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
    projectModules = await openTestProjectModules(
      value,
      projectDir,
      normalizeTestConfig,
      signal
    )
    const config = projectModules?.config ?? normalizeTestConfig(value)
    return {
      config,
      /** Private watch identities; imported config dependencies still widen. */
      watchInputs: [
        ...(filename ? [filename] : []),
        ...(projectModules?.watchInputs ?? []),
        ...(projectModules?.rootProject.globalSetup ?? []).map((file) =>
          path.resolve(projectDir, file)
        ),
      ],
      watchRootProject: projectModules?.rootProject,
      async setup(projects: TestProjectConfig[]) {
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
          realm = await openTestConfigModule(undefined, projectDir, signal)
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
            realm ??= await openTestConfigModule(undefined, projectDir, signal)
            rootContext = await realm.setupRoot({
              ...projectModules.rootProject,
              globalSetup: projectModules.rootProject.globalSetup.map((file) =>
                path.resolve(projectDir, file)
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
    return session.config
  } finally {
    await session.dispose()
  }
}
