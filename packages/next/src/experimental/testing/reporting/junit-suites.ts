import { types } from 'node:util'
import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CompiledTestArtifact, ExecuteTestOptions } from '../contracts'
import type { SerializedDiagnostic, SuiteResult } from './events'

export interface ReportedJUnitSuiteTask {
  id: string
  name: string
  mode: 'run'
  state: 'fail'
  durationMs: number
  errors: { name: string; message: string; stack: string }[]
}

// Capture before authored modules. Observing this role must not invoke their
// property accessors, Array iterators or replaced descriptor/proxy helpers.
const ownDescriptor = Object.getOwnPropertyDescriptor
const ownNames = Object.getOwnPropertyNames
const isArray = Array.isArray
const isProxy = types.isProxy
const finite = Number.isFinite
function record(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !isProxy(value)
}
function data(value: unknown, key: string): unknown {
  if (!record(value)) return undefined
  const descriptor = ownDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
function strings(error: unknown) {
  const name = data(error, 'name')
  const message = data(error, 'message')
  const stack = data(error, 'stack')
  if (
    name !== 'Error' ||
    typeof message !== 'string' ||
    typeof stack !== 'string' ||
    ownDescriptor(error as object, 'cause') ||
    ownDescriptor(error as object, 'errors') ||
    ownDescriptor(error as object, 'diff')
  )
    return undefined
  return { name, message, stack }
}

/** Observe only the already processed actual suite result, never raw Errors. */
export function captureJUnitSuiteTask(
  task: unknown,
  suite: SuiteResult
): ReportedJUnitSuiteTask | undefined {
  if (suite.mode !== 'run' || suite.status !== 'failed' || !suite.errors.length)
    return undefined
  const id = data(task, 'id')
  const name = data(task, 'name')
  const result = data(task, 'result')
  const duration = data(result, 'duration')
  const errors = data(result, 'errors')
  const length = data(errors, 'length')
  if (
    id !== suite.suiteId ||
    data(task, 'type') !== 'suite' ||
    data(task, 'mode') !== 'run' ||
    typeof name !== 'string' ||
    data(result, 'state') !== 'fail' ||
    typeof duration !== 'number' ||
    !finite(duration) ||
    duration < 0 ||
    !record(errors) ||
    !isArray(errors) ||
    length !== suite.errors.length
  )
    return undefined
  const captured: ReportedJUnitSuiteTask['errors'] = []
  for (let index = 0; index < suite.errors.length; index++) {
    const error = strings(data(errors, String(index)))
    const diagnostic = suite.errors[index]
    if (
      !error ||
      error.name !== diagnostic.name ||
      error.message !== diagnostic.message ||
      error.stack !== diagnostic.stack ||
      diagnostic.errors ||
      diagnostic.cause ||
      diagnostic.diff
    )
      return undefined
    captured.push(error)
  }
  return {
    id,
    name,
    mode: 'run',
    state: 'fail',
    durationMs: duration,
    errors: captured,
  }
}

function exactKeys(value: object, keys: readonly string[]) {
  const names = ownNames(value)
  if (names.length !== keys.length) return false
  for (let index = 0; index < names.length; index++)
    if (!keys.includes(names[index])) return false
  return true
}

/** Validate a received observation before retaining it or rendering any XML. */
export function assertJUnitSuiteObservation(
  suite: SuiteResult,
  requested: boolean
): void {
  if (suite.reportedTask === undefined) return
  const task = suite.reportedTask
  const errors = data(task, 'errors')
  const length = data(errors, 'length')
  if (
    !requested ||
    !record(task) ||
    !exactKeys(task, ['id', 'name', 'mode', 'state', 'durationMs', 'errors']) ||
    data(task, 'id') !== suite.suiteId ||
    typeof data(task, 'name') !== 'string' ||
    data(task, 'mode') !== 'run' ||
    data(task, 'state') !== 'fail' ||
    suite.mode !== 'run' ||
    suite.status !== 'failed' ||
    typeof data(task, 'durationMs') !== 'number' ||
    !finite(data(task, 'durationMs')) ||
    (data(task, 'durationMs') as number) < 0 ||
    !record(errors) ||
    !isArray(errors) ||
    length !== suite.errors.length ||
    !length ||
    !exactKeys(errors, [
      'length',
      ...suite.errors.map((_, index) => String(index)),
    ])
  )
    throw new Error('Invalid or unrequested JUnit suite observation.')
  for (let index = 0; index < suite.errors.length; index++) {
    const value = data(errors, String(index))
    const error = strings(value)
    const diagnostic = suite.errors[index]
    if (
      !error ||
      !record(value) ||
      !exactKeys(value, ['name', 'message', 'stack']) ||
      error.name !== diagnostic.name ||
      error.message !== diagnostic.message ||
      error.stack !== diagnostic.stack ||
      diagnostic.errors ||
      diagnostic.cause ||
      diagnostic.diff
    )
      throw new Error('Mismatched JUnit suite error occurrence.')
  }
}

export function assertJUnitSuiteRole(
  artifact: CompiledTestArtifact,
  options: Pick<
    ExecuteTestOptions,
    | 'captureJUnitSuiteTasks'
    | 'collectOnly'
    | 'coverage'
    | 'customCoverage'
    | 'userCancelSignal'
    | 'inspect'
    | 'inspectBrk'
    | 'entry'
  >
): void {
  if (options.captureJUnitSuiteTasks === undefined) return
  if (
    options.captureJUnitSuiteTasks !== true ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.browserClient !== undefined ||
    artifact.profile.route !== undefined ||
    options.collectOnly ||
    options.coverage ||
    options.customCoverage ||
    options.userCancelSignal ||
    options.inspect ||
    options.inspectBrk ||
    options.entry.typecheck ||
    !/\.(?:js|mjs)$/.test(options.entry.file) ||
    (options.entry.executionEnvironment &&
      options.entry.executionEnvironment.name !== 'node')
  )
    throw new Error(
      'JUnit suite observation requires its actual one-shot Node JavaScript artifact.'
    )
}

/** Render only the accepted cached error and this occurrence's mapped frames. */
export function formatJUnitSuiteError(
  error: ReportedJUnitSuiteTask['errors'][number],
  diagnostic: SerializedDiagnostic,
  projectDir: string
): string {
  const frames = (diagnostic.frames ?? []).filter((frame) => !frame.ignored)
  return `${error.name}: ${error.message}${frames
    .map((frame) => {
      const file = frame.file.startsWith('file:')
        ? fileURLToPath(frame.file)
        : frame.file
      const path = relative(projectDir, file).split(sep).join('/')
      const method =
        frame.methodName && frame.methodName !== '<unknown>'
          ? `${frame.methodName} `
          : ''
      return `\n ❯ ${method}${path}:${frame.line}:${frame.column}`
    })
    .join('')}`
}
