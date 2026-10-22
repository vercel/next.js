import type {
  TaskMeta,
  Test,
  TestAnnotation,
  TestAttachment,
  TestTag,
  TestTagDefinition,
  Suite,
  File,
} from './tasks'
import { getCollectionTaskView } from './tasks'
import type { TestExpect } from '../assertions'
import type { ProvidedContext } from '../vitest'
import type { TestError } from '../../../compiled/next-test-primitives'
import {
  configureFixtureCallback,
  normalizeFixtureArguments,
  resolveFixtureDefinitions,
  extendFixtures,
  validateFixtureDefinitions,
} from './fixtures'
import type {
  FixtureDefinitions,
  FixtureOptions,
  BuilderFixtureFn,
} from './fixtures'
import { assertScopeActive, getOriginatingAttempt } from './async-context'
import {
  formatWithOptions,
  inspect,
  createDeclarationStorage,
} from './collector-platform'
import { shuffleTests, type TestSequenceOptions } from './sequence'

const fixtureBuilderReceiver = Symbol('fixture builder receiver')
export const testDeclarationMembers: readonly string[] = [
  'each',
  'for',
  'skipIf',
  'runIf',
  'override',
  'scoped',
  'extend',
  'describe',
  'suite',
  'beforeEach',
  'afterEach',
  'beforeAll',
  'afterAll',
  'aroundEach',
  'aroundAll',
]
const testDeclarationOptions = [
  'timeout',
  'retry',
  'repeats',
  'concurrent',
  'only',
  'skip',
  'todo',
  'fails',
  'tags',
  'meta',
] as const
type FixtureBuilderArguments = [unknown, unknown?, unknown?]
type FixtureBuilderOperations = {
  extend(...args: FixtureBuilderArguments): TestDeclaration
  override(...args: FixtureBuilderArguments): void
}

function fixtureBuilderOperations(receiver: unknown): FixtureBuilderOperations {
  const owner =
    receiver == null
      ? undefined
      : (Reflect.get(Object(receiver), fixtureBuilderReceiver) as {
          getFixtures(): FixtureBuilderOperations
        })
  return owner!.getFixtures()
}

export type TestMode = 'run' | 'skip' | 'todo' | 'only'
export type HookName = 'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach'
export type AroundHookName = 'aroundEach' | 'aroundAll'
export type Cleanup = () => void | Promise<void>

export interface TestContext {
  inject<Key extends keyof ProvidedContext & string>(
    key: Key
  ): ProvidedContext[Key]
  readonly task: Readonly<Test>
  readonly expect: TestExpect
  annotate(
    message: string,
    type?: string,
    attachment?: TestAttachment
  ): Promise<TestAnnotation>
  annotate(
    message: string,
    attachment?: TestAttachment
  ): Promise<TestAnnotation>
  bench(name: string, fn: () => unknown, options?: object): never
  skip(note?: string): never
  skip(condition: boolean, note?: string): void
  readonly signal: AbortSignal
  onTestFinished(handler: OnTestFinishedHandler, timeout?: number): void
  onTestFailed(handler: OnTestFailedHandler, timeout?: number): void
}

export type OnTestFinishedHandler = (
  context: TestContext
) => void | PromiseLike<void>
export type OnTestFailedHandler = (
  context: TestContext
) => void | PromiseLike<void>

// The collector executes internal callbacks and ignores their resolved values.
// Public declarations retain the target's narrower listener return contract.
export type InternalTestContext = Omit<
  TestContext,
  'onTestFinished' | 'onTestFailed'
> & {
  onTestFinished(handler: TestBody, timeout?: number): void
  onTestFailed(handler: TestBody, timeout?: number): void
}
export type TestBody = (
  context: InternalTestContext
) => unknown | Promise<unknown>
export type AroundEachBody<
  T extends object = {},
  Context extends object = TestContext,
> = (
  runTest: () => Promise<void>,
  context: Context & T,
  suite: Readonly<Suite>
) => unknown | Promise<unknown>
export type AroundAllBody<T extends object = {}> = (
  runSuite: () => Promise<void>,
  context: T,
  suite: Readonly<Suite>
) => unknown | Promise<unknown>
export type AroundHook = {
  readonly registrationErrors?: Readonly<Record<'setup' | 'teardown', Error>>
  fn: AroundEachBody | AroundAllBody
  fixtures: FixtureDefinitions
  timeout?: number
}
export type Hook = {
  readonly registrationError?: Error
  fn: TestBody
  timeout?: number
  fixtures?: FixtureDefinitions
}

export interface TestOptions {
  tags?: TestTag | TestTag[]
  meta?: Partial<TaskMeta>
  retry?:
    | number
    | {
        count?: number
        delay?: number
        condition?: RegExp | ((error: TestError) => boolean)
      }
  timeout?: number
  repeats?: number
  fails?: boolean
  concurrent?: boolean
  skip?: boolean
  only?: boolean
  todo?: boolean
}

export interface SuiteOptions extends TestOptions {
  shuffle?: boolean
}

export interface TestCase {
  /** Actual declaration stack; kept off the public task and enumerable data. */
  readonly registrationError?: Error
  type: 'test'
  meta: TaskMeta
  tags: string[]
  id: string
  name: string
  mode: TestMode
  suite: TestSuite
  options: TestOptions
  fn?: TestBody
  fixtures: FixtureDefinitions
}

export interface TestSuite {
  type: 'suite'
  meta: TaskMeta
  tags: string[]
  id: string
  name: string
  mode: TestMode
  suite?: TestSuite
  children: (TestCase | TestSuite)[]
  hooks: Record<HookName, Hook[]>
  around: Record<AroundHookName, AroundHook[]>
  options: SuiteOptions
  fixtureOverrides: Map<FixtureDefinitions, FixtureDefinitions>
}

type Name = string | Function
type EachCallback<T extends readonly unknown[]> = (...items: T) => unknown
type EachDeclaration<T extends readonly unknown[], Options = TestOptions> = {
  (name: Name, fn: EachCallback<T>, timeout?: number): void
  (name: Name, options: Options, fn: EachCallback<T>): void
}
type ForDeclaration<
  T,
  C extends object,
  Context extends object = TestContext,
> = {
  (name: Name, fn: (item: T, context: Context & C) => unknown): void
  (
    name: Name,
    options: TestOptions,
    fn: (item: T, context: Context & C) => unknown
  ): void
}

export function unsupported(api: string): never {
  throw new Error(`Next testing does not support ${api} yet.`)
}

type ScopeValues<T> = [Exclude<T, undefined>] extends [never]
  ? {}
  : Exclude<T, undefined>
type ScopeMarker<T, K extends PropertyKey> = K extends keyof T
  ? Extract<NonNullable<T[K]>, object>
  : {}
type WorkerBuilderContext<T> = ScopeMarker<T, '$__worker'>
type FileBuilderContext<T> = WorkerBuilderContext<T> & ScopeMarker<T, '$__file'>
type FileFixtureContext<T> = '$__file' extends keyof T
  ? FileBuilderContext<T>
  : '$__worker' extends keyof T
    ? FileBuilderContext<T>
    : T
type AddBuilderFixture<
  T,
  K extends string,
  V,
  S extends 'test' | 'file' | 'worker',
> = Omit<T, K | '$__file' | '$__test' | '$__worker'> &
  Record<K, V> & {
    readonly $__worker?: ScopeMarker<T, '$__worker'> &
      (S extends 'worker' ? Record<K, V> : {})
    readonly $__file?: ScopeMarker<T, '$__file'> &
      (S extends 'file' ? Record<K, V> : {})
    readonly $__test?: ScopeMarker<T, '$__test'> &
      (S extends 'test' ? Record<K, V> : {})
  }
interface ScopedFixturesDefinition {
  $test?: Record<string, unknown>
  $file?: Record<string, unknown>
  $worker?: Record<string, unknown>
}
type ScopedFixtureValues<E extends ScopedFixturesDefinition> = ScopeValues<
  E['$test']
> &
  ScopeValues<E['$file']> &
  ScopeValues<E['$worker']>
type FixtureFactory<V, C> = (
  context: C,
  use: (value: V) => Promise<void>
) => Promise<void>
// The reverse callable check preserves the pinned constructor and branded-value cases.
type FixtureValue<E, K extends keyof E, C> = ((
  ...args: any[]
) => any) extends E[K]
  ? E[K] extends any
    ? FixtureFactory<E[K], C>
    : never
  : E[K] | (E[K] extends any ? FixtureFactory<E[K], C> : never)
type ObjectFixtureContext<
  E,
  T,
  K extends keyof E,
  Context extends object,
> = Context & Omit<E, K> & Omit<T, Exclude<keyof E, K>>
type ObjectFixtures<
  E extends object,
  T extends object,
  Context extends object = TestContext,
> = {
  [K in keyof E]:
    | FixtureValue<E, K, ObjectFixtureContext<E, T, K, Context>>
    | [
        FixtureValue<E, K, ObjectFixtureContext<E, T, K, Context>>,
        FixtureOptions,
      ]
}
type FlattenFixtureContext<T> = { [Key in keyof T]: T[Key] }
type ScopedFixtures<
  E extends ScopedFixturesDefinition,
  T extends object,
  Context extends object = TestContext,
> = {
  [K in keyof NonNullable<E['$test']>]:
    | NonNullable<E['$test']>[K]
    | FixtureFactory<
        NonNullable<E['$test']>[K],
        Context & T & ScopedFixtureValues<E>
      >
    | [
        FixtureFactory<
          NonNullable<E['$test']>[K],
          Context & T & ScopedFixtureValues<E>
        >,
        FixtureOptions & { scope?: 'test' },
      ]
} & {
  [K in keyof NonNullable<E['$file']>]: [
    FixtureFactory<
      NonNullable<E['$file']>[K],
      T & ScopeValues<E['$file']> & ScopeValues<E['$worker']>
    >,
    FixtureOptions & { scope: 'file' },
  ]
} & {
  [K in keyof NonNullable<E['$worker']>]: [
    FixtureFactory<NonNullable<E['$worker']>[K], T & ScopeValues<E['$worker']>>,
    FixtureOptions & { scope: 'worker' },
  ]
}

export interface TestDeclaration<
  T extends object = {},
  Context extends object = TestContext,
> {
  readonly fn: (
    this: Record<'concurrent' | 'only' | 'skip' | 'todo' | 'fails', any>,
    name: Name,
    options?: TestOptions,
    fn?: (context: Context & T) => void | PromiseLike<void>
  ) => void
  describe: SuiteDeclaration<Context>
  suite: SuiteDeclaration<Context>
  beforeEach(
    fn: (context: Context & T, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  afterEach(
    fn: (context: Context & T, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  beforeAll(
    fn: (context: FileFixtureContext<T>, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  afterAll(
    fn: (context: FileFixtureContext<T>, suite: Readonly<Suite>) => unknown,
    timeout?: number
  ): void
  aroundEach(fn: AroundEachBody<T, Context>, timeout?: number): void
  aroundAll(fn: AroundAllBody<FileFixtureContext<T>>, timeout?: number): void
  (name: Name, fn: (context: Context & T) => unknown, timeout?: number): void
  (
    name: Name,
    options: TestOptions,
    fn: (context: Context & T) => unknown
  ): void
  (name: Name): void
  readonly skip: TestDeclaration<T, Context>
  readonly only: TestDeclaration<T, Context>
  readonly todo: TestDeclaration<T, Context>
  readonly concurrent: TestDeclaration<T, Context>
  readonly fails: TestDeclaration<T, Context>
  each<C extends readonly unknown[]>(cases: readonly C[]): EachDeclaration<C>
  each<C>(cases: readonly C[]): EachDeclaration<[C]>
  each(strings: TemplateStringsArray, ...values: any[]): EachDeclaration<any[]>
  for<C>(cases: readonly C[]): ForDeclaration<C, T, Context>
  for(
    strings: TemplateStringsArray,
    ...values: any[]
  ): ForDeclaration<any, T, Context>
  skipIf(condition: unknown): TestDeclaration<T, Context>
  runIf(condition: unknown): TestDeclaration<T, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    fn: BuilderFixtureFn<V, Context & T>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'worker' },
    fn: BuilderFixtureFn<V, WorkerBuilderContext<T>>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'worker'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'file' },
    fn: BuilderFixtureFn<V, FileBuilderContext<T>>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'file'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope?: 'test' },
    fn: BuilderFixtureFn<V, Context & T>
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'worker' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'worker'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope: 'file' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'file'>, Context>
  extend<K extends string, V extends K extends keyof T ? T[K] : unknown>(
    name: K,
    options: FixtureOptions & { scope?: 'test' },
    value: V extends (...args: any[]) => any ? never : V
  ): TestDeclaration<AddBuilderFixture<T, K, V, 'test'>, Context>
  extend<E extends object = object>(
    fixtures: ObjectFixtures<E, T, Context>
  ): TestDeclaration<FlattenFixtureContext<Omit<T, keyof E> & E>, Context>
  extend<E extends ScopedFixturesDefinition>(
    fixtures: ScopedFixtures<E, T, Context>
  ): TestDeclaration<T & ScopedFixtureValues<E>, Context>
  override<K extends keyof T>(
    name: K,
    fn: BuilderFixtureFn<T[K], Context & T>
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    options: FixtureOptions,
    fn: BuilderFixtureFn<T[K], Context & T>
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    value: T[K] extends (...args: any[]) => any ? never : T[K]
  ): TestDeclaration<T, Context>
  override<K extends keyof T>(
    name: K,
    options: FixtureOptions,
    value: T[K] extends (...args: any[]) => any ? never : T[K]
  ): TestDeclaration<T, Context>
  override(
    fixtures: Partial<ObjectFixtures<T, T, Context>>
  ): TestDeclaration<T, Context>
  /** @deprecated Use test.override() instead. */
  scoped(
    fixtures: Partial<ObjectFixtures<T, T, Context>>
  ): TestDeclaration<T, Context>
}

export interface SuiteDeclaration<Context extends object = TestContext> {
  readonly fn: (
    this: Record<'concurrent' | 'only' | 'skip' | 'todo' | 'shuffle', any>,
    name: Name,
    options: SuiteOptions,
    fn?: (test: TestDeclaration<{}, Context>) => void | PromiseLike<void>
  ) => SuiteCollector<Omit<Context, keyof TestContext>>
  <ExtraContext extends object = object>(
    name: Name,
    fn: (test: TestDeclaration<ExtraContext, Context>) => unknown,
    timeout?: number
  ): void
  <ExtraContext extends object = object>(
    name: Name,
    options: SuiteOptions,
    fn: (test: TestDeclaration<ExtraContext, Context>) => unknown
  ): void
  (name: Name): void
  readonly skip: SuiteDeclaration<Context>
  readonly only: SuiteDeclaration<Context>
  readonly todo: SuiteDeclaration<Context>
  readonly concurrent: SuiteDeclaration<Context>
  readonly shuffle: SuiteDeclaration<Context>
  each<C extends readonly unknown[]>(
    cases: readonly C[]
  ): EachDeclaration<C, SuiteOptions>
  each<C>(cases: readonly C[]): EachDeclaration<[C], SuiteOptions>
  each(
    strings: TemplateStringsArray,
    ...values: any[]
  ): EachDeclaration<any[], SuiteOptions>
  for<C>(cases: readonly C[]): EachDeclaration<[C], SuiteOptions>
  for(
    strings: TemplateStringsArray,
    ...values: any[]
  ): EachDeclaration<any[], SuiteOptions>
  skipIf(condition: unknown): SuiteDeclaration<Context>
  runIf(condition: unknown): SuiteDeclaration<Context>
}

export interface TaskCustomOptions extends TestOptions {
  each?: boolean
  handler?: (context: TestContext) => void | PromiseLike<void>
}

export interface SuiteHooks<ExtraContext extends object = object> {
  beforeAll: ((suite: Readonly<Suite | File>) => unknown)[]
  afterAll: ((suite: Readonly<Suite | File>) => unknown)[]
  beforeEach: ((
    context: TestContext & ExtraContext,
    suite: Readonly<Suite>
  ) => unknown)[]
  afterEach: ((
    context: TestContext & ExtraContext,
    suite: Readonly<Suite>
  ) => unknown)[]
  aroundEach: ((
    runTest: () => Promise<void>,
    context: TestContext & ExtraContext,
    suite: Readonly<Suite>
  ) => unknown)[]
  aroundAll: ((
    runSuite: () => Promise<void>,
    suite: Readonly<Suite | File>
  ) => unknown)[]
}

export interface SuiteCollector<ExtraContext extends object = object> {
  type: 'collector'
  readonly name: string
  readonly mode: TestMode
  suite?: Suite
  options?: SuiteOptions
  test: TestDeclaration<ExtraContext>
  file: File
  tasks: (Suite | Test<ExtraContext> | SuiteCollector<ExtraContext>)[]
  collect(file: File): Promise<Suite>
  task(name: string, options?: TaskCustomOptions): Test<ExtraContext>
  clear(): void
  on<HookKey extends keyof SuiteHooks<ExtraContext>>(
    name: HookKey,
    ...listeners: SuiteHooks<ExtraContext>[HookKey]
  ): void
}

export function validateOptions(
  options: TestOptions | SuiteOptions,
  suiteOptions = false
) {
  for (const key of Object.keys(options)) {
    if (key === 'tags') {
      if (options.tags === undefined) continue
      const tags = Array.isArray(options.tags) ? options.tags : [options.tags]
      if (tags.some((tag) => typeof tag !== 'string'))
        throw new TypeError('Test tags must be strings.')
      continue
    }
    if (key === 'meta') {
      if (
        options.meta !== undefined &&
        (!options.meta ||
          typeof options.meta !== 'object' ||
          Array.isArray(options.meta))
      )
        throw new TypeError('Test meta must be an object.')
      continue
    }
    if (key === 'shuffle' && suiteOptions) {
      if (typeof (options as SuiteOptions).shuffle !== 'boolean')
        throw new TypeError('Suite shuffle must be a boolean.')
      continue
    }
    if (key === 'concurrent') {
      if (typeof options.concurrent !== 'boolean')
        throw new TypeError('Test concurrent must be a boolean.')
      continue
    }
    if (key === 'fails' || key === 'skip' || key === 'only' || key === 'todo') {
      if (typeof options[key] !== 'boolean')
        throw new TypeError(`Test ${key} must be a boolean.`)
      continue
    }
    if (key === 'retry' && options.retry === undefined) continue
    if (key === 'retry' && typeof options.retry === 'object') {
      if (!options.retry || Array.isArray(options.retry))
        throw new TypeError('Test retry must be a number or an options object.')
      for (const field of Object.keys(options.retry)) {
        if (field === 'condition') {
          const condition = options.retry.condition
          if (
            condition !== undefined &&
            !(condition instanceof RegExp) &&
            typeof condition !== 'function'
          )
            throw new TypeError(
              'Test retry.condition must be a RegExp or a function.'
            )
          continue
        }
        if (field !== 'count' && field !== 'delay')
          unsupported(`test retry option "${field}"`)
        const value = options.retry[field]
        if (
          value !== undefined &&
          (typeof value !== 'number' ||
            !(field === 'count'
              ? Number.isSafeInteger(value)
              : Number.isFinite(value)) ||
            value < 0)
        ) {
          const kind =
            field === 'count'
              ? 'non-negative safe integer'
              : 'finite non-negative number'
          throw new TypeError(`Test retry.${field} must be a ${kind}.`)
        }
      }
      continue
    }
    if (key !== 'retry' && key !== 'timeout' && key !== 'repeats')
      unsupported(`test option "${key}"`)
    const value = options[key]
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0
    ) {
      throw new TypeError(`Test ${key} must be a non-negative safe integer.`)
    }
  }
}

function suite(
  id: string,
  name: string,
  mode: TestMode,
  parent?: TestSuite,
  options: SuiteOptions = {}
): TestSuite {
  return {
    type: 'suite',
    meta: options.meta ?? Object.create(null),
    tags: [
      ...new Set([
        ...(parent?.tags ?? []),
        ...(options.tags === undefined
          ? []
          : Array.isArray(options.tags)
            ? options.tags
            : [options.tags]),
      ]),
    ],
    id,
    name,
    mode,
    suite: parent,
    children: [],
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
    around: { aroundEach: [], aroundAll: [] },
    options,
    fixtureOverrides: new Map(),
  }
}

function formatName(name: Name): string {
  return typeof name === 'string'
    ? name
    : typeof name === 'function'
      ? name.name || '<anonymous>'
      : String(name)
}

function valueAt(value: unknown, path: string): unknown {
  let current: any = value
  for (const part of path.split('.')) current = current?.[part]
  return current
}

function formatTitle(
  template: string,
  items: readonly unknown[],
  index: number
) {
  template = template
    .replace(/%%/g, '__next_escaped_percent__')
    .replace(/%#/g, String(index))
    .replace(/%\$/g, String(index + 1))
    .replace(/__next_escaped_percent__/g, '%%')
  let item = 0
  template = template.replace(/%[sdifjoO]/g, (placeholder) => {
    if (item >= items.length) return placeholder
    const value = items[item++]
    return formatWithOptions({ depth: 10 }, placeholder, value)
  })
  const object = items[0]
  return template.replace(/\$([\w$.]+)/g, (placeholder, path: string) => {
    const value = /^\d+(?:\.|$)/.test(path)
      ? valueAt(items, path)
      : object !== null && typeof object === 'object'
        ? valueAt(object, path)
        : undefined
    return value === undefined
      ? placeholder
      : typeof value === 'string'
        ? value
        : inspect(value, { depth: 10 })
  })
}

function templateCases(strings: readonly string[], values: readonly unknown[]) {
  const headers = strings
    .join('')
    .trim()
    .replace(/ /g, '')
    .split('\n')[0]
    .split('|')
  const cases: Record<string, unknown>[] = []
  for (let row = 0; row < Math.floor(values.length / headers.length); row++) {
    const value: Record<string, unknown> = {}
    for (let column = 0; column < headers.length; column++)
      value[headers[column]] = values[row * headers.length + column]
    cases.push(value)
  }
  return cases
}

/** Runtime-only dispatch target for cached declarations in one compiler cohort. */
export interface CollectorDispatch {
  root: TestSuite
  createDeclaration(
    kind: 'test' | 'suite',
    mode: TestMode,
    fixtures?: FixtureDefinitions,
    options?: SuiteOptions,
    rootChain?: boolean
  ): any
  createHook(
    name: HookName,
    fixtures?: FixtureDefinitions
  ): (fn: TestBody, timeout?: number) => void
  createAround(
    name: AroundHookName,
    fixtures?: FixtureDefinitions
  ): (fn: AroundEachBody | AroundAllBody, timeout?: number) => void
}

/** One collector per evaluated file. No loader or Vitest runtime is started here. */
export function createCollector(
  fileId: string,
  config: {
    filePath?: string
    tags?: readonly TestTagDefinition[]
    strictTags?: boolean
    sequence?: TestSequenceOptions
    getRuntimeConfig?: () => import('../assertions/utilities').RuntimeOptions
    injectValue?: (name: string) => unknown
    getSuiteAlias?: () => SuiteDeclaration | undefined
    getActiveCollector?: () => CollectorDispatch | undefined
    isCollectingScope?: () => boolean
  } = {}
) {
  const root = suite(fileId, '', 'run', undefined, {
    ...(shuffleTests(config.sequence?.shuffle) === undefined
      ? {}
      : { shuffle: shuffleTests(config.sequence?.shuffle) }),
  })
  const suiteStorage = createDeclarationStorage<TestSuite>()
  const pending: Promise<PromiseSettledResult<unknown>>[] = []
  const pendingDeclarations: (() => void)[] = []
  const rawSuites: {
    collected: boolean
    collect(file: File, automatic?: boolean): Promise<Suite>
    api?: SuiteCollector
  }[] = []
  const rawSuiteNodes = new WeakMap<TestSuite, (typeof rawSuites)[number]>()
  let initializing = true
  let closed = false

  const currentSuite = () => suiteStorage.getStore() ?? root

  function assertCollecting() {
    assertScopeActive()
    if (closed) throw new Error('Test collection has already closed.')
    if (config.isCollectingScope && !config.isCollectingScope())
      throw new Error(
        'Test declarations require their active file collection scope.'
      )
  }

  const publicTask = (node: TestSuite | TestCase) =>
    getCollectionTaskView(root, node, {
      filePath: config.filePath,
      testTimeout: config.getRuntimeConfig?.().testTimeout ?? 5000,
    })

  function publishSuite(node: TestSuite): Suite {
    const view = publicTask(node) as Suite
    view.tasks = node.children.map((child) =>
      child.type === 'suite' ? publishSuite(child) : publicTask(child)
    )
    return view
  }

  function registerTest(
    current: TestSuite,
    container: Pick<TestSuite, 'id' | 'children'>,
    name: string,
    ownOptions: TestOptions,
    fn: TestBody | undefined,
    fixtures: FixtureDefinitions,
    mode: TestMode
  ): TestCase {
    const id = `${container.id}/${container.children.length}`
    let options: TestOptions
    const tags = [
      ...new Set([
        ...current.tags,
        ...(ownOptions.tags === undefined
          ? []
          : Array.isArray(ownOptions.tags)
            ? ownOptions.tags
            : [ownOptions.tags]),
      ]),
    ]
    const definitions = tags
      .flatMap((tag) => {
        const definition = config.tags?.find((entry) => entry.name === tag)
        if (!definition && config.strictTags)
          throw new Error(`Unknown test tag "${tag}".`)
        return definition ? [definition] : []
      })
      .sort((a, b) => (b.priority ?? Infinity) - (a.priority ?? Infinity))
    const tagOptions: TestOptions = {}
    const tagMeta = Object.create(null)
    for (const {
      name: _name,
      description: _description,
      priority: _priority,
      meta,
      ...definition
    } of definitions) {
      Object.assign(tagOptions, definition)
      Object.assign(tagMeta, meta)
    }
    const { shuffle: _shuffle, ...suiteOptions } = current.options
    options = {
      ...(config.sequence?.concurrent === undefined
        ? {}
        : { concurrent: config.sequence.concurrent }),
      ...(config.getRuntimeConfig?.().testTimeout === undefined
        ? {}
        : { timeout: config.getRuntimeConfig?.().testTimeout }),
      ...suiteOptions,
      ...tagOptions,
      ...ownOptions,
    }
    validateOptions(options)
    const meta = Object.assign(
      Object.create(null),
      tagMeta,
      current === root ? undefined : current.meta,
      ownOptions.meta
    )
    const optionMode = options.only
      ? 'only'
      : options.skip
        ? 'skip'
        : options.todo
          ? 'todo'
          : mode
    const test: TestCase = {
      type: 'test',
      meta,
      tags,
      id,
      name,
      mode: !fn && optionMode === 'run' ? 'todo' : optionMode,
      suite: current,
      options: { ...options },
      fixtures,
      fn,
    }
    Object.defineProperty(test, 'registrationError', { value: new Error() })
    container.children.push(test)
    return test
  }

  function rawSuite(
    name: Name,
    factory: Function | undefined,
    mode: TestMode,
    options: SuiteOptions
  ): SuiteCollector {
    assertCollecting()
    const parent = currentSuite()
    const id = `${parent.id}/${parent.children.length}`
    let node = suite(id, formatName(name), mode, parent, options)
    parent.children.push(node)
    let staged = node.children
    const registrationContainer = {
      get id() {
        return node.id
      },
      get children() {
        return staged
      },
    }
    const tasks: SuiteCollector['tasks'] = []
    const ownedTest = declaration('test', 'run')
    Object.defineProperties(ownedTest, {
      name: { value: 'chain' },
      length: { value: 0 },
    })
    const test = new Proxy(ownedTest, {
      apply(target, receiver, args) {
        assertCollecting()
        const owner = node
        const published = owner.children
        owner.children = staged
        try {
          suiteStorage.run(owner, () => Reflect.apply(target, receiver, args))
        } finally {
          owner.children = published
        }
        refreshTasks()
      },
    })
    function refreshTasks() {
      tasks.length = 0
      for (const child of staged)
        tasks.push(
          child.type === 'suite' && rawSuiteNodes.has(child)
            ? rawSuiteNodes.get(child)!.api!
            : publicTask(child)
        )
    }
    const state = {
      collected: false,
      async collect(file: File, automatic = false): Promise<Suite> {
        assertCollecting()
        if (!file) throw new TypeError('File is required to collect tasks.')
        if (automatic) state.collected = true
        node.children = staged
        if (factory) await suiteStorage.run(node, () => factory(test))
        async function descendants(container: TestSuite) {
          for (const child of container.children) {
            if (child.type !== 'suite') continue
            const nested = rawSuiteNodes.get(child)
            if (nested) await nested.collect(file, automatic)
            else await descendants(child)
          }
        }
        await descendants(node)
        node.children = [...staged]
        refreshTasks()
        return publishSuite(node)
      },
    }
    async function collect(file: File) {
      return state.collect(file)
    }
    function task(taskName = '', taskOptions: TaskCustomOptions = {}) {
      assertCollecting()
      const { handler, each, ...testOptions } = taskOptions
      const registered = registerTest(
        currentSuite(),
        registrationContainer,
        formatName(taskName),
        testOptions,
        handler,
        {},
        'run'
      )
      const view = publicTask(registered) as Test & { each?: boolean }
      if (each !== undefined) view.each = each
      view.shuffle = options.shuffle
      refreshTasks()
      return view
    }
    function clear() {
      assertCollecting()
      const previous = node
      node = suite(id, previous.name, previous.mode, parent, options)
      staged = node.children
      const index = parent.children.indexOf(previous)
      parent.children[index] = node
      rawSuiteNodes.delete(previous)
      rawSuiteNodes.set(node, state)
      tasks.length = 0
    }
    function addHook(hookName: keyof SuiteHooks, ...listeners: Function[]) {
      assertCollecting()
      suiteStorage.run(node, () => {
        for (const listener of listeners) {
          if (hookName === 'aroundAll')
            around(hookName)(
              (
                runSuite: () => Promise<void>,
                _context: unknown,
                publicSuite: Readonly<Suite | File>
              ) => listener(runSuite, publicSuite)
            )
          else if (hookName === 'aroundEach')
            around(hookName)(listener as AroundEachBody)
          else if (hookName === 'beforeAll' || hookName === 'afterAll')
            hook(hookName)(
              (
                _context: InternalTestContext,
                publicSuite?: Readonly<Suite | File>
              ) => listener(publicSuite)
            )
          else if (hookName === 'beforeEach' || hookName === 'afterEach')
            hook(hookName)((context) =>
              listener(context, context.task.suite ?? context.task.file)
            )
          else unsupported(`SuiteCollector.on(${String(hookName)})`)
        }
      })
    }
    Object.defineProperties(collect, { name: { value: 'collect' } })
    Object.defineProperties(addHook, { name: { value: 'addHook' } })
    const api: SuiteCollector = {
      type: 'collector',
      name: node.name,
      mode,
      suite: publicTask(node) as Suite,
      options,
      test,
      file: publicTask(root) as File,
      tasks,
      collect,
      task,
      clear,
      on: addHook,
    }
    Object.assign(state, { api })
    rawSuites.push(state)
    rawSuiteNodes.set(node, state)
    return api
  }

  function declaration(
    kind: 'test' | 'suite',
    mode: TestMode,
    fixtures: FixtureDefinitions = {},
    declarationOptions: SuiteOptions = {},
    rootChain = true
  ): any {
    const redirected = () => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      return active && active.root !== root
        ? active.createDeclaration(
            kind,
            mode,
            fixtures,
            declarationOptions,
            rootChain
          )
        : undefined
    }
    function fixturesFor(start: TestSuite) {
      return resolveFixtureDefinitions(fixtures, start)
    }
    const declare = (
      name: Name,
      optionsOrFn?: TestOptions | Function,
      body?: TestBody | number,
      ...extra: unknown[]
    ) => {
      const active = redirected()
      if (active)
        return Reflect.apply(active, undefined, [
          name,
          optionsOrFn,
          body,
          ...extra,
        ])
      assertCollecting()
      const current = currentSuite()
      if (extra.length) unsupported('additional declaration arguments')
      name = formatName(name)
      const id = `${current.id}/${current.children.length}`
      if (kind === 'suite') {
        let options: SuiteOptions = {}
        let fn: Function | undefined
        if (typeof optionsOrFn === 'function') {
          if (body !== undefined && typeof body !== 'number')
            unsupported('trailing suite options or multiple callbacks')
          options = typeof body === 'number' ? { timeout: body } : {}
          fn = optionsOrFn
        } else {
          if (body !== undefined && typeof body !== 'function')
            throw new TypeError('Suite callback must be a function.')
          options = (optionsOrFn as SuiteOptions | undefined) ?? {}
          fn = typeof body === 'function' ? body : undefined
        }
        validateOptions(options, true)
        options = { ...declarationOptions, ...options }
        // Chain modifiers override an explicit opposing option in 5.0.4.
        for (const key of ['concurrent', 'shuffle'] as const)
          if (declarationOptions[key] !== undefined)
            options[key] = declarationOptions[key]
        const inheritedOptions = {
          ...current.options,
          ...options,
          meta: Object.assign(
            Object.create(null),
            current === root ? undefined : current.meta,
            options.meta
          ),
        }
        if (config.strictTags) {
          for (const tag of options.tags === undefined
            ? []
            : Array.isArray(options.tags)
              ? options.tags
              : [options.tags])
            if (!config.tags?.some((definition) => definition.name === tag))
              throw new Error(`Unknown test tag "${tag}".`)
        }
        const optionMode = options.only
          ? 'only'
          : options.skip
            ? 'skip'
            : options.todo
              ? 'todo'
              : mode
        if (rawSuiteNodes.has(current)) {
          rawSuite(
            name,
            fn,
            !fn && optionMode === 'run' ? 'todo' : optionMode,
            inheritedOptions
          )
          return
        }
        const child = suite(
          id,
          name,
          !fn && optionMode === 'run' ? 'todo' : optionMode,
          current,
          inheritedOptions
        )
        current.children.push(child)
        const result = fn
          ? suiteStorage.run(child, () => fn(declaration('test', 'run')))
          : undefined
        if (result && typeof result.then === 'function') {
          // Observe immediately, but report after every nested collection job
          // settles. The suite identity follows awaits without changing siblings.
          pending.push(
            Promise.resolve(result).then(
              (value) => ({ status: 'fulfilled' as const, value }),
              (reason) => ({ status: 'rejected' as const, reason })
            )
          )
        }
      } else {
        let options: TestOptions
        let fn: TestBody | undefined
        if (typeof optionsOrFn === 'function') {
          if (body !== undefined && typeof body !== 'number') {
            unsupported('trailing test options or multiple callbacks')
          }
          options = typeof body === 'number' ? { timeout: body } : {}
          fn = optionsOrFn as TestBody
        } else {
          if (
            optionsOrFn !== undefined &&
            (!optionsOrFn || typeof optionsOrFn !== 'object')
          ) {
            throw new TypeError('Test options must be an object.')
          }
          if (body !== undefined && typeof body !== 'function') {
            throw new TypeError('Test callback must be a function.')
          }
          options = optionsOrFn ?? {}
          fn = typeof body === 'function' ? body : undefined
        }
        const ownOptions = { ...declarationOptions, ...options }
        if (declarationOptions.concurrent !== undefined)
          ownOptions.concurrent = declarationOptions.concurrent
        return registerTest(
          current,
          current,
          name,
          ownOptions,
          fn,
          fixtures,
          mode
        )
      }
    }
    const builder: FixtureBuilderOperations = {
      extend(...args) {
        const active = redirected()
        if (active) return active.extend(...args)
        const [fixturesOrName, optionsOrValue, value] = args
        assertCollecting()
        const current = currentSuite()
        const extra = normalizeFixtureArguments(
          'test.extend',
          fixturesOrName,
          optionsOrValue,
          value,
          args.length >= 3
        )
        const extended = extendFixtures(
          resolveFixtureDefinitions(fixtures, root),
          extra,
          false,
          config.injectValue
        )
        validateFixtureDefinitions(
          extended,
          Object.keys(extra),
          current === root
        )
        return declaration('test', 'run', extended)
      },
      override(...args) {
        const active = redirected()
        if (active) return active.override(...args)
        const [fixturesOrName, optionsOrValue, value] = args
        assertCollecting()
        const current = currentSuite()
        const extra = normalizeFixtureArguments(
          'test.override',
          fixturesOrName,
          optionsOrValue,
          value,
          args.length >= 3
        )
        const inherited = fixturesFor(current)
        for (const name of Object.keys(extra)) {
          if (!(name in inherited))
            throw new Error(`Cannot override unknown fixture "${name}".`)
        }
        const overridden = extendFixtures(
          inherited,
          extra,
          true,
          config.injectValue
        )
        validateFixtureDefinitions(
          overridden,
          Object.keys(extra),
          current === root
        )
        current.fixtureOverrides.set(fixtures, overridden)
      },
    }
    const receiverContext = {
      getFixtures: () => builder,
      withContext: () => declare,
    }
    const members = new Map<PropertyKey, unknown>()
    let rawDeclaration: Function | undefined
    let rawSuiteAlias: unknown
    const updateSuiteAlias = () => {
      if (!rawDeclaration) return
      const alias = config.getSuiteAlias?.() ?? describe
      if (alias !== rawSuiteAlias) {
        Object.assign(rawDeclaration, { describe: alias, suite: alias })
        rawSuiteAlias = alias
      }
    }
    const chain = new Proxy(declare, {
      apply(target, receiver, args) {
        Reflect.apply(target, receiver, args)
      },
      get(target, key, receiver) {
        if (key === 'fn') {
          assertScopeActive()
          updateSuiteAlias()
          return Reflect.get(target, key, receiver)
        }
        if (members.has(key)) {
          assertScopeActive()
          return members.get(key)
        }
        const value = member(target, key, receiver)
        if (
          kind === 'test' &&
          typeof key === 'string' &&
          testDeclarationMembers.includes(key) &&
          key !== 'describe' &&
          key !== 'suite'
        )
          members.set(key, value)
        return value
      },
      getOwnPropertyDescriptor(target, key) {
        if (key === 'fn' && kind === 'test') updateSuiteAlias()
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    function member(
      target: typeof declare,
      key: PropertyKey,
      receiver: unknown
    ) {
      if (kind === 'test' && (key === 'beforeAll' || key === 'afterAll'))
        return hook(key, fixtures)
      if (kind === 'test' && (key === 'beforeEach' || key === 'afterEach'))
        return hook(key)
      if (kind === 'test' && (key === 'aroundEach' || key === 'aroundAll'))
        return around(key, fixtures)
      assertScopeActive()
      if (kind === 'test' && (key === 'describe' || key === 'suite'))
        return config.getSuiteAlias?.() ?? describe
      if (key === 'scoped' && kind === 'test')
        return function (this: TestDeclaration, values: object) {
          console.warn(
            'test.scoped() is deprecated and will be removed in future versions. Please use test.override() instead.'
          )
          this.override(values)
          return this
        }
      if (key === fixtureBuilderReceiver && kind === 'test')
        return receiverContext
      if (key === 'extend' && kind === 'test')
        return function (
          this: TestDeclaration,
          ...args: FixtureBuilderArguments
        ) {
          assertScopeActive()
          return fixtureBuilderOperations(this).extend(...args)
        }
      if (key === 'override' && kind === 'test')
        return function (
          this: TestDeclaration,
          ...args: FixtureBuilderArguments
        ) {
          assertScopeActive()
          fixtureBuilderOperations(this).override(...args)
          return this
        }
      if (
        (key === 'each' || key === 'for') &&
        (kind === 'test' || kind === 'suite')
      )
        return function (
          this: unknown,
          casesOrStrings: readonly unknown[],
          ...values: unknown[]
        ) {
          assertScopeActive()
          const owner =
            kind === 'test'
              ? this == null
                ? undefined
                : (Reflect.get(Object(this), fixtureBuilderReceiver) as
                    | typeof receiverContext
                    | undefined)
              : undefined
          const invokeDeclaration =
            kind === 'test' ? owner!.withContext() : declare
          const cases =
            Array.isArray(casesOrStrings) && values.length
              ? templateCases(casesOrStrings as readonly string[], values)
              : casesOrStrings
          if (!Array.isArray(cases))
            throw new TypeError(
              `${kind}.${String(key)} requires an array or template table.`
            )
          return (
            name: Name,
            optionsOrFn?: TestOptions | Function,
            bodyOrTimeout?: Function | number
          ) => {
            const options =
              optionsOrFn && typeof optionsOrFn === 'object'
                ? optionsOrFn
                : undefined
            const fn =
              typeof optionsOrFn === 'function'
                ? optionsOrFn
                : typeof bodyOrTimeout === 'function'
                  ? bodyOrTimeout
                  : undefined
            const timeout =
              typeof bodyOrTimeout === 'number' ? bodyOrTimeout : undefined
            const arrayOnly = cases.every(Array.isArray)
            cases.forEach((value, index) => {
              const items = Array.isArray(value) ? value : [value]
              const title = formatTitle(formatName(name), items, index)
              let callback: Function | undefined
              if (fn) {
                if (key === 'for' && kind === 'test') {
                  callback = (context: TestContext) => fn(value, context)
                  configureFixtureCallback(callback, fn, 1)
                } else if (arrayOnly) callback = () => fn(...items)
                else callback = () => fn(value)
              }
              if (options)
                invokeDeclaration(title, options, callback as TestBody)
              else
                invokeDeclaration(
                  title,
                  callback as TestBody | undefined,
                  timeout
                )
            })
          }
        }
      if (key === 'skip' || key === 'only' || key === 'todo')
        return declaration(
          kind,
          mode === 'skip' || mode === 'todo' ? mode : key,
          fixtures,
          declarationOptions,
          false
        )
      if (key === 'shuffle' && kind === 'suite')
        return declaration(
          kind,
          mode,
          fixtures,
          {
            ...declarationOptions,
            shuffle: true,
          },
          false
        )
      if (key === 'concurrent')
        return declaration(
          kind,
          mode,
          fixtures,
          {
            ...declarationOptions,
            concurrent: true,
          },
          false
        )
      if (key === 'fails' && kind === 'test')
        return declaration(
          kind,
          mode,
          fixtures,
          {
            ...declarationOptions,
            fails: true,
          },
          false
        )
      if (key === 'skipIf')
        if (kind === 'test')
          return function (this: TestDeclaration, condition: unknown) {
            assertScopeActive()
            return condition ? this.skip : this
          }
        else
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(
              kind,
              condition ? 'skip' : mode,
              fixtures,
              declarationOptions,
              false
            )
          }
      if (key === 'runIf')
        if (kind === 'test')
          return function (this: TestDeclaration, condition: unknown) {
            assertScopeActive()
            return condition ? this : this.skip
          }
        else
          return (condition: unknown) => {
            assertScopeActive()
            return declaration(
              kind,
              condition ? mode : 'skip',
              fixtures,
              declarationOptions,
              false
            )
          }
      if (Reflect.has(target, key) || typeof key === 'symbol')
        return Reflect.get(target, key, receiver)
      return unsupported(`${kind === 'test' ? 'test' : 'describe'}.${key}`)
    }
    if (kind === 'test' && rootChain) {
      const raw = function (
        this: any,
        name: Name,
        optionsOrFn?: TestOptions | TestBody,
        optionsOrTest?: TestBody | number
      ) {
        assertScopeActive()
        if (getOriginatingAttempt())
          throw new Error(
            'Calling the test function inside another test function is not allowed. Please put it inside "describe" or "suite" so it can be properly collected.'
          )
        const active = redirected()
        if (active)
          return Reflect.apply(active.fn, this, [
            name,
            optionsOrFn,
            optionsOrTest,
          ])
        assertCollecting()
        if (optionsOrTest != null && typeof optionsOrTest === 'object')
          throw new TypeError(
            'Signature "test(name, fn, { ... })" was deprecated in Vitest 3 and removed in Vitest 4. Please, provide options as a second argument instead.'
          )
        let options: TestOptions = {}
        if (typeof optionsOrTest === 'number')
          options = { timeout: optionsOrTest }
        else if (typeof optionsOrFn === 'object') options = optionsOrFn!
        let handler: TestBody | undefined
        if (typeof optionsOrFn === 'function') {
          if (typeof optionsOrTest === 'function')
            throw new TypeError(
              'Cannot use two functions as arguments. Please use the second argument for options.'
            )
          handler = optionsOrFn
        } else if (typeof optionsOrTest === 'function') handler = optionsOrTest
        const concurrent = this.concurrent ?? options?.concurrent
        if (concurrent != null) options.concurrent = concurrent
        const combined = { ...this, ...options }
        const normalized: TestOptions = {}
        for (const key of testDeclarationOptions)
          if (Object.hasOwn(combined, key))
            (normalized as any)[key] = combined[key]
        for (const key of [
          'concurrent',
          'only',
          'skip',
          'todo',
          'fails',
        ] as const)
          if (Object.hasOwn(normalized, key))
            normalized[key] = !!normalized[key]
        const rawFixtures = combined.fixtures ?? {}
        const rawChain = declaration('test', 'run', rawFixtures, {}, false)
        const registered = rawChain[fixtureBuilderReceiver].withContext()(
          name,
          normalized,
          handler
        ) as TestCase
        if (Object.hasOwn(combined, 'fails'))
          registered.options.fails = combined.fails
      }
      Object.defineProperty(raw, 'name', { value: '' })
      rawDeclaration = raw
      const initialize = () => {
        for (const key of testDeclarationMembers)
          Object.defineProperty(raw, key, {
            value: Reflect.get(chain, key),
            enumerable: true,
            configurable: true,
            writable: true,
          })
      }
      if (initializing) pendingDeclarations.push(initialize)
      else initialize()
      Object.defineProperty(declare, 'fn', { value: raw })
    }
    if (kind === 'suite' && rootChain) {
      function suiteFn(
        this: any,
        name: Name,
        optionsOrFn?: SuiteOptions | Function,
        optionsOrFactory?: Function | number
      ) {
        assertScopeActive()
        if (getOriginatingAttempt())
          throw new Error(
            'Calling the suite function inside test function is not allowed. It can be only called at the top level or inside another suite function.'
          )
        const active = redirected()
        if (active)
          return Reflect.apply(active.fn, this, [
            name,
            optionsOrFn,
            optionsOrFactory,
          ])
        assertCollecting()
        if (optionsOrFactory != null && typeof optionsOrFactory === 'object')
          throw new TypeError(
            'Signature "test(name, fn, { ... })" was deprecated in Vitest 3 and removed in Vitest 4. Please, provide options as a second argument instead.'
          )
        let own: SuiteOptions = {}
        let factory: Function | undefined
        if (typeof optionsOrFactory === 'number')
          own = { timeout: optionsOrFactory }
        else if (typeof optionsOrFn === 'object') own = optionsOrFn!
        if (typeof optionsOrFn === 'function') {
          if (typeof optionsOrFactory === 'function')
            throw new TypeError(
              'Cannot use two functions as arguments. Please use the second argument for options.'
            )
          factory = optionsOrFn
        } else if (typeof optionsOrFactory === 'function')
          factory = optionsOrFactory
        const current = currentSuite()
        const { meta: parentMeta, ...parentOptions } = current.options
        const options = { ...parentOptions, ...own }
        const shuffle = this.shuffle ?? options.shuffle
        if (shuffle != null) options.shuffle = shuffle
        let suiteMode: TestMode =
          (this.only ?? options.only)
            ? 'only'
            : (this.skip ?? options.skip)
              ? 'skip'
              : (this.todo ?? options.todo)
                ? 'todo'
                : 'run'
        if (suiteMode === 'run' && !factory) suiteMode = 'todo'
        const concurrent = this.concurrent ?? options.concurrent
        if (concurrent != null) options.concurrent = concurrent
        if (parentMeta)
          options.meta = Object.assign(
            Object.create(null),
            parentMeta,
            options.meta
          )
        // Read the raw parameterization marker at the same point as the target.
        // Only plain raw receivers are qualified by this collector increment.
        const each = this.each
        validateOptions(options, true)
        const result = rawSuite(name, factory, suiteMode, options)
        if (each !== undefined)
          (result.suite as Suite & { each?: boolean }).each = each
        return result
      }
      const initialize = () => {
        for (const key of ['each', 'for', 'skipIf', 'runIf'])
          Object.defineProperty(suiteFn, key, {
            value: Reflect.get(chain, key),
            enumerable: true,
            configurable: true,
            writable: true,
          })
      }
      if (initializing) pendingDeclarations.push(initialize)
      else initialize()
      Object.defineProperty(declare, 'fn', { value: suiteFn })
    }
    return chain
  }

  const test: TestDeclaration<{}, InternalTestContext> = declaration(
    'test',
    'run'
  )
  const describe: SuiteDeclaration<InternalTestContext> = declaration(
    'suite',
    'run'
  )
  const hook =
    (name: HookName, fixtures?: FixtureDefinitions) =>
    (fn: TestBody, timeout?: number) => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      if (active && active.root !== root)
        return active.createHook(name, fixtures)(fn, timeout)
      assertCollecting()
      if (typeof fn !== 'function')
        throw new TypeError(`${name} requires a callback.`)
      if (timeout !== undefined) validateOptions({ timeout })
      const registered: Hook = {
        fn,
        fixtures,
        timeout: timeout ?? config.getRuntimeConfig?.().hookTimeout,
      }
      Object.defineProperty(registered, 'registrationError', {
        value: new Error(),
      })
      currentSuite().hooks[name].push(registered)
    }
  const around =
    (name: AroundHookName, fixtures: FixtureDefinitions = {}) =>
    (fn: AroundHook['fn'], timeout?: number) => {
      assertScopeActive()
      const active = config.getActiveCollector?.()
      if (active && active.root !== root)
        return active.createAround(name, fixtures)(fn, timeout)
      assertCollecting()
      if (typeof fn !== 'function')
        throw new TypeError(`${name} requires a callback.`)
      if (timeout !== undefined) validateOptions({ timeout })
      const registered: AroundHook = {
        fn,
        fixtures,
        timeout: timeout ?? config.getRuntimeConfig?.().hookTimeout,
      }
      Object.defineProperty(registered, 'registrationErrors', {
        value: { setup: new Error(), teardown: new Error() },
      })
      currentSuite().around[name].push(registered)
    }

  initializing = false
  for (const initialize of pendingDeclarations) initialize()
  return {
    root,
    createDeclaration: declaration,
    createHook: hook,
    createAround: around,
    api: {
      test,
      it: test,
      describe,
      suite: describe,
      beforeAll: hook('beforeAll'),
      afterAll: hook('afterAll'),
      beforeEach: hook('beforeEach'),
      afterEach: hook('afterEach'),
      aroundEach: around('aroundEach'),
      aroundAll: around('aroundAll'),
    },
    async settle() {
      const errors: unknown[] = []
      // Awaiting a suite can register more async suites. Read the live queue
      // length until all collection work, including rejected siblings, finishes.
      let index = 0
      let rawIndex = 0
      while (index < pending.length || rawIndex < rawSuites.length) {
        while (index < pending.length) {
          const result = await pending[index++]
          if (result.status === 'rejected') errors.push(result.reason)
        }
        const raw = rawSuites[rawIndex++]
        if (raw && !raw.collected) {
          try {
            await raw.collect(publicTask(root) as File, true)
          } catch (error) {
            errors.push(error)
          }
        }
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1)
        throw new AggregateError(errors, 'Test suite collection failed.')
    },
    close() {
      closed = true
      return root
    },
  }
}

export function hasFocusedTests(node: TestSuite | TestCase): boolean {
  return (
    node.mode === 'only' ||
    (node.type === 'suite' && node.children.some(hasFocusedTests))
  )
}

export function selectedCases(
  root: TestSuite
): Map<TestCase, 'run' | 'skip' | 'todo'> {
  const cases = new Map<TestCase, 'run' | 'skip' | 'todo'>()
  const containsOnly = new Map<TestSuite, boolean>()
  function collectFocus(node: TestSuite | TestCase): boolean {
    let childrenOnly = false
    if (node.type === 'suite') {
      for (const child of node.children)
        if (collectFocus(child)) childrenOnly = true
      containsOnly.set(node, childrenOnly)
    }
    // Collection records focus even beneath skipped and todo suites.
    return node.mode === 'only' || childrenOnly
  }
  const focused = collectFocus(root)
  function visit(
    node: TestSuite,
    inherited: 'run' | 'skip' | 'todo',
    parentIsOnly: boolean
  ) {
    const suiteIsOnly = parentIsOnly || node.mode === 'only'
    const childrenOnly = focused && containsOnly.get(node)
    for (const child of node.children) {
      // Descendant focus narrows an enclosing describe.only to those branches.
      const included = childrenOnly
        ? child.mode === 'only' ||
          (child.type === 'suite' && containsOnly.get(child))
        : suiteIsOnly || child.mode === 'only'
      const mode =
        inherited !== 'run'
          ? inherited
          : child.mode === 'todo'
            ? 'todo'
            : child.mode === 'skip' || (focused && !included)
              ? 'skip'
              : 'run'
      if (child.type === 'suite') visit(child, mode, !!included)
      else cases.set(child, mode)
    }
  }
  visit(
    root,
    root.mode === 'skip' || root.mode === 'todo' ? root.mode : 'run',
    false
  )
  return cases
}

/** Declaration-order facts, after real setup/spec and asynchronous collection. */
export function collectTestCases(
  root: TestSuite,
  options: { testNamePattern?: string | RegExp; allowOnly?: boolean } = {}
): { id: string; name: string }[] {
  if (options.allowOnly === false && hasFocusedTests(root))
    throw new Error(
      'Collected listing with focus and allowOnly:false is not implemented.'
    )
  const pattern =
    options.testNamePattern === undefined
      ? undefined
      : new RegExp(options.testNamePattern)
  const cases: { id: string; name: string }[] = []
  for (const [test, mode] of selectedCases(root)) {
    if (mode !== 'run') continue
    const names = [test.name]
    for (let parent = test.suite; parent !== root; parent = parent.suite!)
      names.unshift(parent.name)
    const name = names.join(' > ')
    if (pattern && !name.match(pattern)) continue
    cases.push({ id: test.id, name })
  }
  return cases
}
