import { relative, sep } from 'node:path'
import { assertReporterTaskTree, type ReporterTaskSnapshot } from './live-tasks'
import {
  isReportedSuiteError,
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
  name?: string
  fullName?: string
  moduleId?: string
  relativeModuleId?: string
  module?: View
  parent?: View
  project: { name: string }
  options?: {
    mode: 'run' | 'skip' | 'todo'
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
function declarationOptions(
  value: ReporterTaskSnapshot,
  tags: string[]
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
    mode:
      value.mode === 'todo' ? 'todo' : value.mode === 'skip' ? 'skip' : 'run',
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
export function createLiveReporterTaskStore(projectDir: string) {
  const modules = new Map<string, View>()
  const tasks = new Map<string, Retained>()
  const fileOutcomes = new Map<string, { state: State; errors: unknown[] }>()
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
    const observed = new Set<string>()
    const collect = (value: ReporterTaskSnapshot) => {
      observed.add(value.id)
      value.tasks?.forEach(collect)
    }
    collect(tree)
    if (updating && [...updating].some((id) => !observed.has(id)))
      throw new Error('Live reporter update references an absent task.')
    const project = { name: tree.projectName ?? '' }
    function visit(
      value: ReporterTaskSnapshot,
      parent?: View,
      root?: View
    ): View {
      const childIds = value.tasks?.map((item) => item.id) ?? []
      let retained = tasks.get(value.id)
      if (retained) {
        if (
          retained.value.type !== value.type ||
          retained.view.parent !== parent ||
          retained.childIds.join('\0') !== childIds.join('\0')
        )
          throw new Error('Live reporter declaration identity changed.')
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
          !parent && fileOutcomes.has(tree.id)
            ? fileOutcomes.get(tree.id)!.state
            : stateOf(current().result?.state ?? current().mode)
        const errors = () =>
          !parent && fileOutcomes.has(tree.id)
            ? fileOutcomes.get(tree.id)!.errors
            : (current().result?.errors ?? [])
        const view: View = {
          type: parent ? value.type : 'module',
          id: value.id,
          project,
          ...(parent
            ? {
                name: value.name,
                fullName: value.fullTestName ?? value.name,
                parent,
                module: root,
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
                options: declarationOptions(value, tags),
                tags,
              }),
          state,
          errors,
          ok: () => state() !== 'failed',
          meta: () => tasks.get(value.id)!.meta,
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
          annotations: () => [...(current().annotations ?? [])],
          artifacts: () => [...(current().artifacts ?? [])],
        }
        if (parent && !view.options)
          view.options = declarationOptions(value, tags)
        const exposed = new Proxy(view, {
          get(target, key, receiver) {
            if (
              [
                'task',
                'diagnostic',
                'toTestSpecification',
                'logs',
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
      }
      const view = retained.view
      if (parent) {
        view.name = value.name
        view.fullName = value.fullTestName ?? value.name
      }
      const children = (value.tasks ?? []).map((child) =>
        visit(child, view, root ?? view)
      )
      retained.children.splice(0, retained.children.length, ...children)
      return view
    }
    const module = visit(tree)
    modules.set(tree.id, module)
    return module
  }
  return {
    update,
    get(entryId: string) {
      return modules.get(entryId)
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
    finishModule(entryId: string, completion: CustomReporterCompletion) {
      const module = modules.get(entryId)
      if (!module) return undefined
      const file = completion.files.find((item) => item.entryId === entryId)
      if (!file)
        throw new Error('Live reporter module requires actual file completion.')
      const root = completion.suites.find(
        (item) => item.entryId === entryId && item.suiteId === entryId
      )
      const errors = [
        ...(root?.errors ?? []),
        ...completion.events.flatMap((event) =>
          event.type === 'diagnostic' &&
          event.entryId === entryId &&
          !isReportedSuiteError(event, completion.events) &&
          event.diagnostic.unhandled !== 'rejection' &&
          event.diagnostic.severity === 'error'
            ? [event.diagnostic]
            : []
        ),
      ]
      fileOutcomes.set(entryId, {
        state:
          file.status === 'passed'
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
