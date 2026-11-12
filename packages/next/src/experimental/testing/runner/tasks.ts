import { processTaskError } from '../primitives/error'
import type { TestExpect } from '../assertions'
import type { TestError } from '../primitives'
import type {
  TestBody,
  TestCase,
  TestContext,
  TestOptions,
  TestSuite,
} from './collector'
import { basename } from './task-path'
import { getPublicTestContext } from './invocation-platform'
import type { AttemptContext } from './lifecycle'

const applyTaskErrorAccessor = Reflect.apply
const readTaskErrorProperty = Reflect.get
const writeTaskErrorProperty = Reflect.set
const TaskErrorProxy = Proxy

export interface TaskMeta {
  typecheck?: boolean
  benchmark?: boolean
  __vitest_label__?: string
}

export interface TestTags {}
export type TestTag = keyof TestTags extends never ? string : keyof TestTags
export interface TestTagDefinition extends Omit<TestOptions, 'tags'> {
  name: string
  description?: string
  priority?: number
}

export interface TestAttachment {
  contentType?: string
  path?: string
  body?: string | Uint8Array | undefined
  bodyEncoding?: 'base64' | 'utf-8'
}
export interface TestArtifactLocation {
  file: string
  line: number
  column: number
}
export type TestAnnotationLocation = TestArtifactLocation
export interface TestAnnotation {
  message: string
  type: string
  location?: TestArtifactLocation
  attachment?: TestAttachment
}
export interface TestArtifactBase {
  attachments?: TestAttachment[]
  location?: TestArtifactLocation
}
/** Public custom artifact registry, merged by consumer module augmentation. */
export interface TestArtifactRegistry {}
export interface TestAnnotationArtifact extends TestArtifactBase {
  type: 'internal:annotation'
  annotation: TestAnnotation
}
export interface VisualRegressionArtifactAttachment extends TestAttachment {
  name: 'reference' | 'actual' | 'diff'
  width: number
  height: number
}
export interface VisualRegressionArtifact extends TestArtifactBase {
  type: 'internal:toMatchScreenshot'
  kind: 'visual-regression'
  message: string
  attachments: VisualRegressionArtifactAttachment[]
}
export interface BrowserTraceArtifact extends TestArtifactBase {
  type: 'internal:browserTrace'
  data: unknown
}
export interface FailureScreenshotArtifactAttachment extends TestAttachment {
  path: string
  originalPath: string
  body?: undefined
}
export interface FailureScreenshotArtifact extends TestArtifactBase {
  type: 'internal:failureScreenshot'
  attachments: [FailureScreenshotArtifactAttachment] | []
}
export type TestArtifact =
  | BrowserTraceArtifact
  | FailureScreenshotArtifact
  | TestAnnotationArtifact
  | VisualRegressionArtifact
  | TestArtifactRegistry[keyof TestArtifactRegistry]

export interface TaskResult {
  state: 'run' | 'pass' | 'fail' | 'skip' | 'only' | 'todo' | 'queued'
  errors?: TestError[]
  duration?: number
  startTime?: number
  retryCount?: number
  repeatCount?: number
  pending?: boolean
  note?: string
  hooks?: Partial<
    Record<
      'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach',
      TaskResult['state']
    >
  >
}
export interface TaskLocation {
  line: number
  column: number
}

interface TaskBase {
  location?: TaskLocation
  id: string
  name: string
  fullName: string
  fullTestName?: string
  mode: 'run' | 'skip' | 'todo' | 'only' | 'queued'
  meta: TaskMeta
  tags: string[]
  concurrent?: boolean
  shuffle?: boolean
  file: File
  suite?: Suite
  result?: TaskResult
  promises?: Promise<any>[]
}
export interface Test<ExtraContext = object> extends TaskBase {
  type: 'test'
  context: TestContext & ExtraContext
  timeout: number
  retry?: Exclude<TestOptions['retry'], undefined>
  repeats?: number
  fails?: boolean
  annotations: TestAnnotation[]
  artifacts: TestArtifact[]
  benchmarks: unknown[]
}
export interface Suite extends TaskBase {
  type: 'suite'
  tasks: Task[]
}
export interface File extends Suite {
  filepath: string
  projectName: string
}
export type Task = Test | Suite
export type TaskPopulated = Task
export type ExpectStatic = TestExpect

// Only declarations that expose collection-time handles enter this registry.
// The runner reuses those real handles without putting private callbacks into
// the task graph sent to the parent process.
const collectionTaskViews = new WeakMap<TestCase | TestSuite, Task>()
const collectionTaskRegistrations = new WeakMap<
  TestCase,
  (task: Test) => void
>()

export function registerCollectionTaskRegistration(
  node: TestCase,
  register: (task: Test) => void
) {
  collectionTaskRegistrations.set(node, register)
}

function bindCollectionTaskRegistration(node: TestCase, task: Test) {
  const register = collectionTaskRegistrations.get(node)
  if (register) {
    register(task)
    collectionTaskRegistrations.delete(node)
  }
}

type CollectionContextOwner = {
  assertCollecting(): void
  getExpect(): TestExpect
}
const publishedContexts = new WeakMap<
  Test,
  {
    context: TestContext
    controller: AbortController
    expect?: TestExpect
    collection?: CollectionContextOwner
    resolve?: (api?: string) => AttemptContext
    listeners?: Pick<AttemptContext, 'onTestFinished' | 'onTestFailed'>
  }
>()

/** A real task owns its context before its first attempt, and across every retry. */
export function getTaskContext(
  task: Test,
  collection?: CollectionContextOwner
) {
  let published = publishedContexts.get(task)
  if (!published) {
    const controller = new AbortController()
    const owner = (api?: string) => {
      const resolve = published!.resolve
      if (!resolve)
        throw new Error('Test context requires an active Next test attempt.')
      return resolve(api)
    }
    const context = function context() {
      throw new Error('done() callback is deprecated, use promise instead')
    } as unknown as TestContext & { onCleanup: AttemptContext['onCleanup'] }
    Object.defineProperty(context, 'name', {
      value: 'context',
      configurable: true,
    })
    const methods = {
      signal: controller.signal,
      task,
      skip: function (condition: unknown, _note: unknown) {
        if (!published!.resolve && condition === false) {
          published!.collection?.assertCollecting()
          if (published!.collection) return
        }
        return Reflect.apply(owner('skip()').skip, undefined, arguments)
      } as TestContext['skip'],
      annotate: function (
        _message: unknown,
        _attachment: unknown,
        _location: unknown
      ) {
        return Reflect.apply(owner('annotate()').annotate, undefined, arguments)
      } as TestContext['annotate'],
      onTestFailed: function (handler, timeout) {
        const register = published!.listeners?.onTestFailed
        return register
          ? register(handler, timeout)
          : owner().onTestFailed(handler, timeout)
      } as TestContext['onTestFailed'],
      onTestFinished: function (handler, timeout) {
        const register = published!.listeners?.onTestFinished
        return register
          ? register(handler, timeout)
          : owner().onTestFinished(handler, timeout)
      } as TestContext['onTestFinished'],
    }
    // The primitive publishes anonymous methods, including when they are extracted.
    for (const method of Object.values(methods))
      if (typeof method === 'function')
        Object.defineProperty(method, 'name', { value: '', configurable: true })
    Object.assign(context, methods)
    Object.defineProperties(context, {
      expect: {
        get() {
          // Browser publishes a guarded facade and keeps its existing resolver.
          const retain = published!.context === context
          if (retain && published!.expect) return published!.expect
          let local: TestExpect
          if (published!.resolve) local = owner().expect
          else {
            published!.collection?.assertCollecting()
            if (!published!.collection)
              throw new Error(
                'context.expect requires an assertion integration.'
              )
            local = published!.collection.getExpect()
          }
          if (retain) published!.expect = local
          return local
        },
      },
      inject: {
        value: (key: string) => owner().inject(key as never),
        configurable: true,
        writable: true,
      },
      bench: {
        value: (...args: Parameters<TestContext['bench']>) =>
          Reflect.apply(owner().bench, undefined, args),
        configurable: true,
        writable: true,
      },
      onCleanup: {
        value: (cleanup: Parameters<AttemptContext['onCleanup']>[0]) =>
          owner().onCleanup(cleanup),
        configurable: true,
        writable: true,
      },
    })
    published = { context: getPublicTestContext(context), controller }
    publishedContexts.set(task, published)
    Object.defineProperty(task, 'context', {
      value: published.context,
      writable: true,
      configurable: true,
    })
  }
  if (collection) published.collection = collection
  const held = published
  return {
    context: held.context,
    controller: held.controller,
    bind(resolve: (api?: string) => AttemptContext) {
      held.resolve = resolve
    },
    bindListeners(
      listeners: Pick<AttemptContext, 'onTestFinished' | 'onTestFailed'>
    ) {
      held.listeners = listeners
    },
    get listeners() {
      return held.listeners
    },
  }
}

/** Global selection uses the real task while its original registrar stays private. */
export function registerPublishedTaskListener(
  task: Test,
  name: 'onTestFinished' | 'onTestFailed',
  handler: TestBody,
  timeout?: number
) {
  const published = publishedContexts.get(task)
  if (!published) throw new Error('Test context has not been published.')
  const register = published.listeners?.[name] ?? published.context[name]
  Reflect.apply(register, undefined, [handler, timeout])
}

const publishedTaskLocations = new WeakMap<Task, TaskLocation | undefined>()

/** The real collection publication precedes runtime mutation of the actual Task. */
export function getPublishedTaskLocation(task: Task): TaskLocation | undefined {
  return publishedTaskLocations.get(task)
}

export function getCollectionTaskView(
  root: TestSuite,
  node: TestCase | TestSuite,
  options: { filePath?: string; projectName?: string; testTimeout: number }
): Task {
  const held = collectionTaskViews.get(node)
  if (held) return held
  if (node === root) {
    const filePath = options.filePath ?? root.id
    const file = {
      id: root.id,
      name: basename(filePath),
      fullName: basename(filePath),
      type: 'suite',
      mode: root.mode,
      meta: root.meta,
      tags: root.tags,
      shuffle: root.options.shuffle,
      filepath: filePath,
      projectName: options.projectName ?? '',
      tasks: [],
    } as unknown as File
    file.file = file
    collectionTaskViews.set(root, file)
    return file
  }
  const file = getCollectionTaskView(root, root, options) as File
  const parent = getCollectionTaskView(root, node.suite!, options) as Suite
  const fullTestName = [parent.fullTestName, node.name]
    .filter(Boolean)
    .join(' > ')
  const common = {
    ...(node.location === undefined ? {} : { location: node.location }),
    // Child IDs are published once the completed file graph is ready to run.
    id: '',
    name: node.name,
    fullName: [file.fullName, fullTestName].filter(Boolean).join(' > '),
    fullTestName,
    mode: node.mode,
    meta: node.meta,
    tags: node.tags,
    ...(node.type === 'suite' || node.options.concurrent
      ? { concurrent: node.options.concurrent }
      : {}),
    shuffle:
      node.type === 'test' ? node.suite.options.shuffle : node.options.shuffle,
    file,
    suite: parent === file ? undefined : parent,
  }
  const view =
    node.type === 'suite'
      ? ({ ...common, type: 'suite', tasks: [] } as Suite)
      : ({
          ...common,
          type: 'test',
          timeout: node.options.timeout ?? options.testTimeout,
          retry: node.options.retry,
          repeats: node.options.repeats,
          fails: node.options.fails,
          annotations: [],
          artifacts: [],
          benchmarks: [],
        } as unknown as Test)
  collectionTaskViews.set(node, view)
  if (node.type === 'test') {
    getTaskContext(view as Test)
    bindCollectionTaskRegistration(node, view as Test)
  }
  return view
}

/** Public task identity is stable while private attempts retain scope ownership. */
export function createTaskTree(
  root: TestSuite,
  options: { filePath?: string; projectName?: string; testTimeout: number }
) {
  const filePath = options.filePath ?? root.id
  const fields = {
    id: root.id,
    name: basename(filePath),
    fullName: basename(filePath),
    type: 'suite',
    mode: root.mode,
    meta: root.meta,
    tags: root.tags,
    shuffle: root.options.shuffle,
    filepath: filePath,
    projectName: options.projectName ?? '',
    tasks: [],
  } as unknown as File
  const file = (collectionTaskViews.get(root) as File | undefined) ?? fields
  if (file !== fields) {
    Object.assign(file, { ...fields, tasks: file.tasks })
    file.tasks.length = 0
  }
  file.file = file
  const tasks = new Map<TestCase | TestSuite, Task>([[root, file]])
  function visit(node: TestCase | TestSuite, parent: Suite) {
    const held = collectionTaskViews.get(node)
    const declarationParent =
      held && node.type === 'test'
        ? (getCollectionTaskView(root, node.suite, options) as Suite)
        : parent
    const fullTestName = [declarationParent.fullTestName, node.name]
      .filter(Boolean)
      .join(' > ')
    const common = {
      ...(!held && node.location !== undefined
        ? { location: node.location }
        : {}),
      id: node.id,
      name: node.name,
      fullName: [file.fullName, fullTestName].filter(Boolean).join(' > '),
      fullTestName,
      mode: node.mode,
      meta: node.meta,
      tags: node.tags,
      ...(node.type === 'suite' || node.options.concurrent
        ? { concurrent: node.options.concurrent }
        : {}),
      shuffle:
        node.type === 'test'
          ? held
            ? held.shuffle
            : node.suite.options.shuffle
          : node.options.shuffle,
      file,
      suite: declarationParent === file ? undefined : declarationParent,
    }
    let task: Task
    if (node.type === 'suite') {
      task = held ?? { ...common, type: 'suite', tasks: [] }
      if (held) {
        Object.assign(task, common)
        ;(task as Suite).tasks.length = 0
      }
      tasks.set(node, task)
      for (const child of node.children) visit(child, task as Suite)
    } else {
      const test: Test = {
        ...common,
        type: 'test',
        context:
          held?.type === 'test'
            ? held.context
            : (undefined as unknown as TestContext),
        timeout: node.options.timeout ?? options.testTimeout,
        retry: node.options.retry,
        repeats: node.options.repeats,
        fails: node.options.fails,
        annotations: [],
        artifacts: [],
        benchmarks: [],
      }
      task = held ? Object.assign(held, test) : test
      bindCollectionTaskRegistration(node, task as Test)
      tasks.set(node, task)
    }
    parent.tasks.push(task)
  }
  for (const child of root.children) visit(child, file)
  for (const task of tasks.values()) {
    if (publishedTaskLocations.has(task)) continue
    const descriptor = Object.getOwnPropertyDescriptor(task, 'location')
    const location = descriptor ? task.location : undefined
    publishedTaskLocations.set(
      task,
      location === undefined
        ? undefined
        : { line: location.line, column: location.column }
    )
  }
  return { file, tasks }
}

/** Finalized exclusions belong to the actual cached tasks and execution plan. */
export function finalizePublicTaskModes(
  root: TestSuite,
  tasks: ReadonlyMap<TestCase | TestSuite, Task>,
  actualSelection?: ReadonlyMap<TestCase, 'run' | 'skip' | 'todo'>
): ReadonlyMap<TestCase | TestSuite, 'run' | 'skip' | 'todo' | 'only'> {
  const modes = new Map<
    TestCase | TestSuite,
    'run' | 'skip' | 'todo' | 'only'
  >()
  const filteredModes =
    actualSelection === undefined
      ? undefined
      : new Map<TestCase, 'run' | 'skip' | 'todo'>()
  if (actualSelection === undefined) {
    for (const [node, task] of tasks)
      modes.set(
        node,
        task.mode === 'skip' || task.mode === 'todo' ? task.mode : 'run'
      )
  } else {
    for (const [node, task] of tasks) {
      const selected =
        node.type === 'test' ? actualSelection.get(node) : undefined
      if (
        node.type === 'test' &&
        selected !== 'run' &&
        selected !== 'skip' &&
        selected !== 'todo'
      )
        throw new Error('Finalized modes require each actual test selection.')
      if (node.type === 'test') filteredModes!.set(node, selected!)
      modes.set(
        node,
        node.mode === 'only'
          ? 'only'
          : task.mode === 'skip' || task.mode === 'todo'
            ? task.mode
            : 'run'
      )
    }
  }
  const exclude = (suite: TestSuite, mode: 'skip' | 'todo') => {
    for (const child of suite.children)
      if (modes.get(child) === 'run') {
        modes.set(child, mode)
        if (child.type === 'suite') exclude(child, mode)
      }
  }
  const visit = (suite: TestSuite) => {
    for (const child of suite.children) {
      if (child.type !== 'suite') {
        if (filteredModes) modes.set(child, filteredModes.get(child)!)
        continue
      }
      const mode = modes.get(child)
      if (mode === 'skip' || mode === 'todo') exclude(child, mode)
      else {
        if (mode === 'only') modes.set(child, 'run')
        visit(child)
      }
    }
    if (
      modes.get(suite) === 'run' &&
      suite.children.length > 0 &&
      suite.children.every((child) => modes.get(child) !== 'run')
    )
      modes.set(suite, 'skip')
  }
  visit(root)
  for (const [node, mode] of modes) {
    const task = tasks.get(node)!
    if (task.mode !== mode) task.mode = mode
  }
  return modes
}

/** The pinned serializer mutates diff values/causes; task views must not alter raw failures. */
export function serializeTaskError(error: unknown): TestError {
  const seen = new Map<object, object>()
  function errorScalarFlag(key: PropertyKey) {
    return key === 'name' ? 1 : key === 'message' ? 2 : key === 'stack' ? 4 : 0
  }
  function inheritedDescriptor(target: object, key: PropertyKey) {
    for (
      let value = Object.getPrototypeOf(target);
      value;
      value = Object.getPrototypeOf(value)
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (descriptor) return descriptor
    }
  }
  function copy(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const previous = seen.get(value)
    if (previous) return previous
    const copyTarget: object = Array.isArray(value)
      ? []
      : Object.create(Object.getPrototypeOf(value))
    let inheritedWrites = 0
    const cloned = new TaskErrorProxy(copyTarget, {
      get(target, key, receiver) {
        if (Object.getOwnPropertyDescriptor(target, key))
          return readTaskErrorProperty(target, key, receiver)
        const descriptor = inheritedDescriptor(target, key)
        if (descriptor && !('value' in descriptor) && errorScalarFlag(key)) {
          if (!descriptor.get) return undefined
          // An actual serializer write retains its existing clone-local
          // computation. Untouched getters still need the failure's receiver.
          return (inheritedWrites & errorScalarFlag(key)) !== 0
            ? applyTaskErrorAccessor(descriptor.get, cloned, [])
            : readTaskErrorProperty(value, key, value)
        }
        return readTaskErrorProperty(target, key, receiver)
      },
      set(target, key, next, receiver) {
        if (Object.getOwnPropertyDescriptor(target, key))
          return writeTaskErrorProperty(target, key, next, receiver)
        const descriptor = inheritedDescriptor(target, key)
        if (descriptor && !('value' in descriptor) && errorScalarFlag(key)) {
          if (!descriptor.set) return false
          inheritedWrites |= errorScalarFlag(key)
          applyTaskErrorAccessor(descriptor.set, cloned, [next])
          return true
        }
        return writeTaskErrorProperty(target, key, next, receiver)
      },
    })
    // Recursive causes and direct self references must see this final identity.
    seen.set(value, cloned)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      if (!('value' in descriptor) && errorScalarFlag(key)) {
        const getter = descriptor.get
        let assigned = false
        let assignedValue: unknown
        Object.defineProperty(cloned, key, {
          ...descriptor,
          configurable: true,
          get: getter
            ? () => {
                if (key !== 'stack' && assigned)
                  return applyTaskErrorAccessor(getter, cloned, [])
                // Read the current property: an earlier authored getter may
                // have replaced its descriptor during this serialization.
                const original = readTaskErrorProperty(value, key, value)
                return assigned ? assignedValue : original
              }
            : undefined,
          set: descriptor.set
            ? (next: unknown) => {
                assigned = true
                assignedValue = next
                // Native stack writes remain local without calling its setter.
                // Other setters retain their prior clone-local side effects.
                if (key !== 'stack')
                  applyTaskErrorAccessor(descriptor.set!, cloned, [next])
              }
            : undefined,
        })
        continue
      }
      Object.defineProperty(cloned, key, {
        ...descriptor,
        ...(key === 'length' && Array.isArray(value)
          ? {}
          : { configurable: true }),
        ...('value' in descriptor
          ? {
              writable: true,
              ...(seen.has(descriptor.value)
                ? { value: seen.get(descriptor.value) }
                : {}),
            }
          : {}),
      })
    }
    if ('cause' in value && value.cause && typeof value.cause === 'object')
      Object.defineProperty(cloned, 'cause', {
        configurable: true,
        writable: true,
        enumerable: Object.prototype.propertyIsEnumerable.call(value, 'cause'),
        value: copy(value.cause),
      })
    return cloned
  }
  const copied = copy(error)
  return processTaskError(copied, seen)
}
