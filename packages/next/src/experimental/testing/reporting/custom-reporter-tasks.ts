import type { TestArtifact, TaskLocation } from '../runner/tasks'
import { relative, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { createTestReporter } from './reporter'
import type { CaseResult, ResultEvent, SerializedDiagnostic } from './events'
import { orderTestDeclarations, orderTestSpecifications } from './task-order'

type Results = ReturnType<ReturnType<typeof createTestReporter>['getResults']>
export interface CustomReporterCompletion extends Results {
  events: ResultEvent[]
  status: 'passed' | 'failed' | 'cancelled'
  recordedReporterErrors?: SerializedDiagnostic[]
}

type State = 'passed' | 'failed' | 'skipped' | 'pending'
interface Task {
  type: 'module' | 'suite' | 'test'
  id: string
  name?: string
  fullName?: string
  moduleId?: string
  relativeModuleId?: string
  module?: Task
  parent?: Task
  project: { name: string }
  location?: TaskLocation
  options?: { mode: 'run' | 'skip' | 'todo'; tags?: string[] }
  tags?: string[]
  children?: Collection
  result?(): { state: State; errors?: SerializedDiagnostic[]; note?: string }
  state?(): State
  errors?(): SerializedDiagnostic[]
  ok(): boolean
  meta(): NonNullable<CaseResult['meta']>
  annotations?(): unknown[]
  artifacts?(): TestArtifact[]
}
class Collection {
  constructor(private items: Task[]) {}
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
  *tests(state?: State): Generator<Task> {
    for (const task of this.items)
      if (task.type === 'test' && (!state || task.result!().state === state))
        yield task
  }
  *suites(): Generator<Task> {
    for (const task of this.items) if (task.type === 'suite') yield task
  }
  *allTests(state?: State): Generator<Task> {
    for (const task of this.items) {
      if (task.type === 'suite') yield* task.children!.allTests(state)
      else if (!state || task.result!().state === state) yield task
    }
  }
  *allSuites(): Generator<Task> {
    for (const task of this.suites()) {
      yield task
      yield* task.children!.allSuites()
    }
  }
}
function expose(task: Task): Task {
  return new Proxy(task, {
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
}
const stateOf = (status?: string): State =>
  status === 'passed' || status === 'failed' || status === 'skipped'
    ? status
    : 'pending'

/** Resolve only the actual preceding suite result referenced by this diagnostic. */
export function isReportedSuiteError(
  event: Extract<ResultEvent, { type: 'diagnostic' }>,
  events: readonly ResultEvent[]
): boolean {
  const owner = event.suiteError
  const at = events.indexOf(event)
  if (
    !owner ||
    at < 0 ||
    !event.entryId ||
    !event.revision ||
    !Number.isSafeInteger(owner.index) ||
    owner.index < 0
  )
    return false
  const matches = events
    .slice(0, at)
    .filter(
      (previous): previous is Extract<ResultEvent, { type: 'suite-end' }> =>
        previous.type === 'suite-end' &&
        previous.runId === event.runId &&
        previous.entryId === event.entryId &&
        previous.revision === event.revision &&
        previous.suiteId === owner.suiteId
    )
  return (
    matches.length === 1 &&
    matches[0].errors[owner.index] !== undefined &&
    isDeepStrictEqual(matches[0].errors[owner.index], event.diagnostic)
  )
}

/** Final task views come from retained producer events, never replayed hooks. */
export function createCustomReporterModules(
  projectDir: string,
  completion: CustomReporterCompletion
): Task[] {
  const specificationOrder = completion.events.find(
    (event) => event.type === 'run-start'
  )?.specificationOrder
  return orderTestSpecifications(
    completion.entries,
    specificationOrder,
    (item) => item.entry.id
  ).map(({ entry }) => {
    const file = completion.files.find((result) => result.entryId === entry.id)
    const rootResult = completion.suites.find(
      (suite) => suite.suiteId === entry.id && suite.entryId === entry.id
    )
    const project = { name: entry.projectName ?? entry.profile.id }
    const rootChildren: Task[] = []
    const fileErrors = [
      ...(rootResult?.errors ?? []),
      ...completion.events.flatMap((event) =>
        event.type === 'diagnostic' &&
        event.entryId === entry.id &&
        !isReportedSuiteError(event, completion.events) &&
        event.diagnostic.unhandled !== 'rejection' &&
        event.diagnostic.severity === 'error'
          ? [event.diagnostic]
          : []
      ),
    ]
    const module = expose({
      type: 'module',
      id: entry.id,
      project,
      moduleId: entry.file,
      relativeModuleId: relative(projectDir, entry.file).split(sep).join('/'),
      children: new Collection(rootChildren),
      state: () => stateOf(file?.status),
      ok: () => file?.status !== 'failed',
      errors: () => fileErrors,
      meta: () => {
        throw new Error(
          'Custom reporter suite/module metadata is not present in the Next result protocol.'
        )
      },
    })
    const suites = new Map<string, { task: Task; children: Task[] }>()
    suites.set(entry.id, { task: module, children: rootChildren })
    function ancestors(chain: { id: string; name: string }[] = []) {
      let parent = suites.get(entry.id)!
      for (const ancestor of chain) {
        let suite = suites.get(ancestor.id)
        if (!suite) {
          const result = completion.suites.find(
            (candidate) =>
              candidate.entryId === entry.id &&
              candidate.suiteId === ancestor.id
          )
          const children: Task[] = []
          const task = expose({
            type: 'suite',
            id: ancestor.id,
            name: ancestor.name,
            project,
            fullName:
              parent.task.type === 'module'
                ? ancestor.name
                : `${parent.task.fullName} > ${ancestor.name}`,
            module,
            parent: parent.task,
            options: { mode: result?.mode ?? 'run' },
            children: new Collection(children),
            state: () => stateOf(result?.status),
            errors: () => result?.errors ?? [],
            ok: () => result?.status !== 'failed',
            meta: () => {
              throw new Error(
                'Custom reporter suite/module metadata is not present in the Next result protocol.'
              )
            },
          })
          suite = { task, children }
          parent.children.push(task)
          suites.set(ancestor.id, suite)
        }
        parent = suite
      }
      return parent
    }
    for (const suite of completion.suites) {
      if (suite.entryId !== entry.id || suite.suiteId === entry.id) continue
      ancestors([...suite.ancestors, { id: suite.suiteId, name: suite.name }])
    }
    for (const test of completion.cases) {
      if (test.entryId !== entry.id) continue
      const parent = ancestors(test.ancestors)
      const name = test.testName ?? test.name
      const metadata = test.meta ?? {}
      const state = test.bail ? 'pending' : stateOf(test.status)
      const errors = completion.events.flatMap((event) =>
        event.type === 'case-end' &&
        event.entryId === test.entryId &&
        event.caseId === test.caseId
          ? event.errors.flatMap((error) =>
              error.name === 'AggregateError' && error.errors
                ? error.errors
                : [error]
            )
          : []
      )
      parent.children.push(
        expose({
          type: 'test',
          id: test.caseId,
          project,
          name,
          fullName:
            parent.task.type === 'module'
              ? name
              : `${parent.task.fullName} > ${name}`,
          location:
            test.location?.line !== undefined &&
            test.location.column !== undefined
              ? { line: test.location.line, column: test.location.column }
              : undefined,
          module,
          parent: parent.task,
          options: { mode: test.mode ?? 'run', tags: test.tags },
          tags: test.tags ?? [],
          result: () => ({
            state,
            ...(state === 'skipped'
              ? { note: test.note }
              : errors.length
                ? { errors }
                : state === 'failed'
                  ? { errors: [] }
                  : {}),
          }),
          ok: () => state !== 'failed',
          meta: () => metadata,
          annotations: () => [...(test.annotations ?? [])],
          artifacts: () =>
            completion.events.flatMap((event) =>
              event.type === 'test-artifact' &&
              event.entryId === entry.id &&
              event.caseId === test.caseId
                ? [event.artifact]
                : []
            ),
        })
      )
    }
    for (const { task, children } of suites.values())
      children.splice(
        0,
        children.length,
        ...orderTestDeclarations(task.id, children, (child) => child.id)
      )
    return module
  })
}
