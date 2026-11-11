import {
  createReporterTaskLogs,
  type ReporterConsoleLog,
} from './custom-reporter-logs'
import type { TestRecordEvent } from '../contracts'
import {
  isRunErrorDiagnostic,
  hasOnlyBrowserCleanupFailures,
} from './run-errors'
import { relative, sep } from 'node:path'
import type { TestEntry } from '../contracts'
import { assertReporterTaskTree, type ReporterTaskSnapshot } from './live-tasks'
import { assertReporterTaskPacks, type ReporterTaskPack } from './task-updates'
import {
  isReportedSuiteError,
  getActualBrowserRootErrors,
  type CustomReporterCompletion,
} from './custom-reporter-tasks'

type State = 'passed' | 'failed' | 'skipped' | 'pending'
const stateOf = (state?: string): State =>
  state === 'pass'
    ? 'passed'
    : state === 'fail'
      ? 'failed'
      : state === 'skip' || state === 'todo'
        ? 'skipped'
        : 'pending'
interface View {
  type: 'module' | 'suite' | 'test'
  id: string
  location?: ReporterTaskSnapshot['location']
  name?: string
  fullName?: string
  moduleId?: string
  relativeModuleId?: string
  module?: View
  parent?: View
  project: { name: string }
  options?: {
    mode: 'run' | 'skip' | 'todo' | 'only'
    tags: string[]
    each?: boolean
    fails?: boolean
    concurrent?: boolean
    shuffle?: boolean
    retry?: ReporterTaskSnapshot['retry']
    repeats?: number
    timeout?: number
  }
  tags?: string[]
  children?: Collection
  result(): { state: State; errors?: unknown[]; note?: string }
  state(): State
  errors(): unknown[]
  ok(): boolean
  meta(): ReporterTaskSnapshot['meta']
  annotations(): unknown[]
  artifacts(): unknown[]
  logs(): ReporterConsoleLog[]
}
class Collection {
  constructor(private readonly items: View[]) {}
  get size() {
    return this.items.length
  }
  at(index: number) {
    return this.items.at(index)
  }
  array() {
    return [...this.items]
  }
  *[Symbol.iterator]() {
    yield* this.items
  }
  *tests(state?: State): Generator<View> {
    for (const item of this.items)
      if (item.type === 'test' && (!state || item.result().state === state))
        yield item
  }
  *suites(): Generator<View> {
    for (const item of this.items) if (item.type === 'suite') yield item
  }
  *allTests(state?: State): Generator<View> {
    for (const item of this.items) {
      if (item.type === 'suite') yield* item.children!.allTests(state)
      else if (!state || item.result().state === state) yield item
    }
  }
  *allSuites(): Generator<View> {
    for (const item of this.suites()) {
      yield item
      yield* item.children!.allSuites()
    }
  }
}
export type QueuedReporterEntry = Pick<TestEntry, 'id' | 'file' | 'projectName'>

/** The selected file exists; no collected declaration or result exists yet. */
export function createQueuedReporterModule(
  projectDir: string,
  entry: QueuedReporterEntry,
  project: View['project'] = { name: entry.projectName ?? '' },
  logs: () => ReporterConsoleLog[] = () => []
) {
  const meta: ReporterTaskSnapshot['meta'] = {}
  return {
    type: 'module' as const,
    id: entry.id,
    moduleId: entry.file,
    relativeModuleId: relative(projectDir, entry.file).split(sep).join('/'),
    project,
    children: new Collection([]),
    state: () => 'pending' as const,
    errors: (): unknown[] => [],
    ok: () => true,
    meta: () => meta,
    logs,
  }
}

function declarationOptions(
  value: ReporterTaskSnapshot,
  tags: string[],
  excludedOnly = false
): NonNullable<View['options']> {
  return {
    each: value.each,
    fails: value.type === 'test' && value.fails,
    concurrent: value.concurrent,
    shuffle: value.shuffle,
    retry: value.retry,
    repeats: value.repeats,
    tags,
    timeout: value.type === 'test' ? value.timeout : undefined,
    mode: excludedOnly
      ? 'only'
      : value.mode === 'todo'
        ? 'todo'
        : value.mode === 'skip'
          ? 'skip'
          : 'run',
  }
}

interface Retained {
  value: ReporterTaskSnapshot
  view: View
  meta: ReporterTaskSnapshot['meta']
  tags: string[]
  children: View[]
  childIds: string[]
}

/** Stable views follow actual producer snapshots; pending declarations are never guessed. */
export function createLiveReporterTaskStore(
  projectDir: string,
  logs = createReporterTaskLogs()
) {
  const queued = new Map<
    string,
    {
      entry: QueuedReporterEntry
      view: ReturnType<typeof createQueuedReporterModule>
    }
  >()
  const modules = new Map<string, View>()
  const tasks = new Map<string, Retained>()
  const fileOutcomes = new Map<string, { state: State; errors: unknown[] }>()
  const recordedAnnotations = new Map<string, unknown[]>()
  const recordedArtifacts = new Map<string, unknown[]>()
  function update(
    tree: ReporterTaskSnapshot,
    taskUpdateIds?: string[],
    importedModuleName?: string
  ): View {
    assertReporterTaskTree(tree, tree.id)
    const updating = taskUpdateIds && new Set(taskUpdateIds)
    if (
      updating &&
      (updating.size !== taskUpdateIds!.length || !modules.has(tree.id))
    )
      throw new Error(
        'Live reporter updates require the actual collected file.'
      )
    const observed = new Map<
      string,
      { value: ReporterTaskSnapshot; parentId: string | null }
    >()
    const collect = (
      value: ReporterTaskSnapshot,
      physicalParent: string | null
    ) => {
      observed.set(value.id, {
        value,
        parentId:
          value.parentSuiteId === undefined
            ? physicalParent
            : value.parentSuiteId,
      })
      value.tasks?.forEach((child) => collect(child, value.id))
    }
    collect(tree, null)
    if (updating && [...updating].some((id) => !observed.has(id)))
      throw new Error('Live reporter update references an absent task.')
    // Reject declaration changes before replacing any previously exposed state.
    for (const { value, parentId } of observed.values()) {
      const retained = tasks.get(value.id)
      if (
        retained &&
        (retained.view.type !== (value === tree ? 'module' : value.type) ||
          retained.view.parent !==
            (value === tree
              ? undefined
              : tasks.get(parentId ?? tree.id)?.view) ||
          retained.childIds.join('\0') !==
            (value.tasks?.map((item) => item.id) ?? []).join('\0'))
      )
        throw new Error('Live reporter declaration identity changed.')
    }
    const excludedOnly = (value: ReporterTaskSnapshot) => {
      if (value.mode !== 'only' || value.result !== undefined) return false
      let parent = observed.get(value.id)!.parentId
      while (parent !== null && parent !== tree.id) {
        const ancestor = observed.get(parent)!
        if (
          ancestor.value.type === 'suite' &&
          (ancestor.value.mode === 'skip' || ancestor.value.mode === 'todo')
        )
          return true
        parent = ancestor.parentId
      }
      return false
    }
    const selected = queued.get(tree.id)
    if (
      selected &&
      (tree.filepath !== selected.entry.file ||
        (tree.projectName ?? '') !== (selected.entry.projectName ?? ''))
    )
      throw new Error('Collected module differs from its selected queue entry.')
    const project = selected?.view.project ?? { name: tree.projectName ?? '' }
    if (!modules.has(tree.id)) logs.collectFile(tree.id)
    const created = new Set<string>()
    function allocate(value: ReporterTaskSnapshot): View {
      const isRoot = value === tree
      const childIds = value.tasks?.map((item) => item.id) ?? []
      let retained = tasks.get(value.id)
      if (retained) {
        if (!updating || updating.has(value.id)) {
          retained.value = value
          retained.meta = value.meta
        }
      } else {
        const meta = value.meta,
          tags = [...value.tags],
          children: View[] = []
        const current = () => tasks.get(value.id)!.value
        const state = () =>
          isRoot && fileOutcomes.has(tree.id)
            ? fileOutcomes.get(tree.id)!.state
            : stateOf(current().result?.state ?? current().mode)
        const errors = () =>
          isRoot && fileOutcomes.has(tree.id)
            ? fileOutcomes.get(tree.id)!.errors
            : (current().result?.errors ?? [])
        const view: View = {
          type: isRoot ? 'module' : value.type,
          id: value.id,
          location: value.location,
          project,
          ...(!isRoot
            ? {
                name: value.name,
                fullName: value.fullTestName ?? value.name,
              }
            : {
                moduleId: tree.filepath,
                relativeModuleId:
                  importedModuleName ??
                  (tree.filepath
                    ? relative(projectDir, tree.filepath).split(sep).join('/')
                    : undefined),
              }),
          ...(value.type === 'suite'
            ? { children: new Collection(children) }
            : {
                options: declarationOptions(value, tags, excludedOnly(value)),
                tags,
              }),
          state,
          errors,
          ok: () => state() !== 'failed',
          meta: () => tasks.get(value.id)!.meta,
          logs: isRoot ? logs.forFile(value.id) : () => logs.forTask(value.id),
          result: () => {
            const resultState = view.state()
            if (resultState === 'skipped')
              return {
                state: resultState,
                note: current().result?.note,
                errors: undefined,
              }
            if (resultState === 'pending')
              return { state: resultState, errors: undefined }
            return {
              state: resultState,
              errors:
                resultState === 'passed' ? current().result?.errors : errors(),
            }
          },
          annotations: () => [
            ...(recordedAnnotations.get(value.id) ??
              current().annotations ??
              []),
          ],
          artifacts: () => [
            ...(recordedArtifacts.get(value.id) ?? current().artifacts ?? []),
          ],
        }
        if (!isRoot && !view.options)
          view.options = declarationOptions(value, tags, excludedOnly(value))
        const exposed = new Proxy(view, {
          get(target, key, receiver) {
            if (
              [
                'task',
                'diagnostic',
                'toTestSpecification',
                'benchmarks',
              ].includes(String(key))
            )
              throw new Error(
                `Custom reporter task.${String(key)} needs a broader Next tooling adapter and is not implemented.`
              )
            return Reflect.get(target, key, receiver)
          },
        })
        retained = { value, view: exposed, meta, tags, children, childIds }
        tasks.set(value.id, retained)
        created.add(value.id)
      }
      const view = retained.view
      if (!isRoot) {
        view.name = value.name
        view.fullName = value.fullTestName ?? value.name
      }
      return view
    }
    for (const { value } of observed.values()) allocate(value)
    const module = tasks.get(tree.id)!.view
    for (const { value, parentId } of observed.values()) {
      const retained = tasks.get(value.id)!
      const parent =
        value === tree ? undefined : tasks.get(parentId ?? tree.id)!.view
      if (!created.has(value.id) && retained.view.parent !== parent)
        throw new Error('Live reporter declaration identity changed.')
      if (value !== tree) {
        retained.view.parent = parent
        retained.view.module = module
      }
      const children = (value.tasks ?? []).map(
        (child) => tasks.get(child.id)!.view
      )
      retained.children.splice(0, retained.children.length, ...children)
    }
    modules.set(tree.id, module)
    return module
  }
  return {
    /** An actual queue occurrence has no captured declaration or outcome yet. */
    queue(entry: QueuedReporterEntry, project?: View['project']) {
      if (queued.has(entry.id) || modules.has(entry.id))
        throw new Error(
          'Selected reporter module was already queued or collected.'
        )
      if (project && project.name !== (entry.projectName ?? ''))
        throw new Error('Queued reporter module has another selected project.')
      const view = createQueuedReporterModule(
        projectDir,
        entry,
        project,
        logs.forFile(entry.id)
      )
      queued.set(entry.id, { entry: { ...entry }, view })
      return view
    },
    /** Logs are retained before callbacks can observe or mutate their actual row. */
    recordConsoleLog(entryId: string | undefined, log: ReporterConsoleLog) {
      const id = log.taskId
      if (!entryId || !id) return
      const task = tasks.get(id)?.view
      if (
        id === entryId ||
        (task && (task.id === entryId || task.module?.id === entryId))
      )
        logs.append(id, log, id === entryId)
    },
    /** A specification follows the currently registered module for its entry. */
    getSelectedModule(entryId: string) {
      return modules.get(entryId) ?? queued.get(entryId)?.view
    },
    update,
    updatePacks(entryId: string, packs: ReporterTaskPack[]) {
      if (!modules.has(entryId))
        throw new Error(
          'Live reporter updates require the actual collected file.'
        )
      assertReporterTaskPacks(packs)
      for (const [id] of packs) {
        const retained = tasks.get(id)
        if (
          !retained ||
          (retained.view !== modules.get(entryId) &&
            retained.view.module !== modules.get(entryId))
        )
          throw new Error('Live reporter update references an absent task.')
      }
      for (const [id, pack] of packs) {
        const retained = tasks.get(id)!
        retained.value = {
          ...retained.value,
          result: pack.result,
          meta: pack.meta,
        }
        retained.meta = pack.meta
      }
    },
    get(entryId: string) {
      return modules.get(entryId)
    },
    record(event: TestRecordEvent) {
      const retained = tasks.get(event.caseId)
      if (
        !retained ||
        retained.view.type !== 'test' ||
        retained.view.module !== modules.get(event.entryId)
      )
        throw new Error('Live reporter record is missing its actual Test.')
      const annotations = event.type === 'test-annotation'
      const records = annotations ? recordedAnnotations : recordedArtifacts
      let values = records.get(event.caseId)
      if (!values) {
        values = [
          ...((annotations
            ? retained.value.annotations
            : retained.value.artifacts) ?? []),
        ]
        records.set(event.caseId, values)
      }
      // These are controller-owned actual occurrences. Later worker snapshots
      // can lack a value when its reporter callback rejected; keep the record.
      values.push(annotations ? event.annotation : event.artifact)
      return retained.view
    },
    suite(entryId: string, suiteId: string) {
      const retained = tasks.get(suiteId)
      if (
        !retained ||
        retained.view.type !== 'suite' ||
        retained.view.module !== modules.get(entryId)
      )
        throw new Error(
          'Live reporter suite is missing its actual declaration.'
        )
      return retained.view
    },
    hook(entryId: string, taskId: string, name: string) {
      const retained = tasks.get(taskId)
      const module = modules.get(entryId)
      if (
        !retained ||
        !module ||
        (retained.view !== module && retained.view.module !== module) ||
        !['beforeAll', 'afterAll', 'beforeEach', 'afterEach'].includes(name) ||
        (name.endsWith('Each')
          ? retained.view.type !== 'test'
          : !['suite', 'module'].includes(retained.view.type))
      )
        throw new Error('Live reporter hook is missing its actual declaration.')
      return retained.view
    },
    case(entryId: string, caseId: string) {
      const retained = tasks.get(caseId)
      if (
        !retained ||
        retained.view.type !== 'test' ||
        retained.view.module !== modules.get(entryId)
      )
        throw new Error(
          'Live reporter result is missing its actual declaration.'
        )
      return retained.view
    },
    finishModule(
      entryId: string,
      completion: CustomReporterCompletion,
      collectionFailure = false
    ) {
      const module = modules.get(entryId)
      if (!module) return undefined
      const file = completion.files.find((item) => item.entryId === entryId)
      if (!file)
        throw new Error('Live reporter module requires actual file completion.')
      const root = completion.suites.find(
        (item) => item.entryId === entryId && item.suiteId === entryId
      )
      const actualErrors = getActualBrowserRootErrors(entryId, completion)
      const errors = [
        ...(actualErrors ?? root?.errors ?? []),
        ...completion.events.flatMap((event) =>
          event.type === 'diagnostic' &&
          event.entryId === entryId &&
          !isReportedSuiteError(event, completion.events) &&
          !isRunErrorDiagnostic(event.diagnostic) &&
          event.diagnostic.severity === 'error'
            ? collectionFailure &&
              event.diagnostic.phase === 'collection' &&
              event.diagnostic.name === 'AggregateError' &&
              event.diagnostic.errors
              ? event.diagnostic.errors
              : [event.diagnostic]
            : []
        ),
      ]
      fileOutcomes.set(entryId, {
        state:
          file.status === 'passed' &&
          (tasks.get(entryId)?.value.mode === 'skip' ||
            tasks.get(entryId)?.value.mode === 'todo')
            ? 'skipped'
            : file.status === 'passed' ||
                hasOnlyBrowserCleanupFailures(entryId, completion)
              ? 'passed'
              : file.status === 'failed'
                ? 'failed'
                : 'pending',
        errors,
      })
      return module
    },
  }
}
