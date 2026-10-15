import { processError } from '../../../compiled/next-test-primitives/error'
import type { TestExpect } from '../assertions'
import type { TestError } from '../../../compiled/next-test-primitives'
import type { TestCase, TestContext, TestOptions, TestSuite } from './collector'
import { basename } from './task-path'

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
  body?: string | Uint8Array
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
interface TaskBase {
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
}
export interface Test<ExtraContext extends object = object> extends TaskBase {
  type: 'test'
  context: TestContext & ExtraContext
  timeout: number
  retry?: TestOptions['retry']
  repeats?: number
  fails?: boolean
  annotations: TestAnnotation[]
  artifacts: (TestArtifactBase & { type: string })[]
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

/** Public task identity is stable while private attempts retain scope ownership. */
export function createTaskTree(
  root: TestSuite,
  options: { filePath?: string; projectName?: string; testTimeout: number }
) {
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
  const tasks = new Map<TestCase | TestSuite, Task>([[root, file]])
  function visit(node: TestCase | TestSuite, parent: Suite) {
    const fullTestName = [parent.fullTestName, node.name]
      .filter(Boolean)
      .join(' > ')
    const common = {
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
          ? node.suite.options.shuffle
          : node.options.shuffle,
      file,
      suite: parent === file ? undefined : parent,
    }
    let task: Task
    if (node.type === 'suite') {
      task = { ...common, type: 'suite', tasks: [] }
      tasks.set(node, task)
      for (const child of node.children) visit(child, task)
    } else {
      task = {
        ...common,
        type: 'test',
        context: undefined as unknown as TestContext,
        timeout: node.options.timeout ?? options.testTimeout,
        retry: node.options.retry,
        repeats: node.options.repeats,
        fails: node.options.fails,
        annotations: [],
        artifacts: [],
        benchmarks: [],
      }
      tasks.set(node, task)
    }
    parent.tasks.push(task)
  }
  for (const child of root.children) visit(child, file)
  return { file, tasks }
}

/** The pinned serializer mutates diff values/causes; task views must not alter raw failures. */
export function serializeTaskError(error: unknown): TestError {
  const seen = new Map<object, object>()
  function copy(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    const previous = seen.get(value)
    if (previous) return previous
    const cloned = Array.isArray(value)
      ? []
      : Object.create(Object.getPrototypeOf(value))
    seen.set(value, cloned)
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!
      Object.defineProperty(cloned, key, {
        ...descriptor,
        ...(key === 'length' && Array.isArray(value)
          ? {}
          : { configurable: true }),
        ...('value' in descriptor ? { writable: true } : {}),
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
  return processError(copy(error))
}
