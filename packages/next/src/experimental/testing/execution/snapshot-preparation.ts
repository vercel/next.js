import { types } from 'node:util'
import type { TestError } from '../../../compiled/next-test-primitives'
import { serializeTaskError } from '../runner/tasks'
import type { SerializedDiagnostic } from '../reporting/events'

export interface SnapshotPreparationOwner {
  runId: string
  entryId: string
  revision: string
}

/** One actual file preparation occurrence; never a public task result. */
export type SnapshotPreparationFailure = Readonly<
  SnapshotPreparationOwner & {
    version: 1
    phase: 'snapshot-preparation'
    invocation: 0
    source: 'run' | 'failed-collection'
    outcome:
      | Readonly<{
          kind: 'error'
          diagnostic: SerializedDiagnostic
          reportedError: TestError
        }>
      | Readonly<{ kind: 'undefined' }>
  }
>

const isNativeError = types.isNativeError
function data(value: object, key: PropertyKey): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function exact(value: object, keys: readonly string[]) {
  const names = Reflect.ownKeys(value)
  return (
    names.length === keys.length &&
    names.every((key) => typeof key === 'string' && keys.includes(key))
  )
}

/** Capture authored Error properties once, before deriving either projection. */
export function captureSnapshotPreparationFailure(
  error: unknown,
  owner: SnapshotPreparationOwner,
  source: SnapshotPreparationFailure['source']
): SnapshotPreparationFailure {
  let outcome: SnapshotPreparationFailure['outcome']
  if (error === undefined) outcome = { kind: 'undefined' }
  else {
    if (!isNativeError(error))
      throw new Error(
        'Public snapshot preparation has not qualified this thrown value.'
      )
    // The pinned task serializer owns accessor/toJSON behavior. Diagnostics read
    // only its captured data, never the original Error a second time.
    const captured = serializeTaskError(error)
    if (!record(captured) || typeof data(captured, 'message') !== 'string')
      throw new Error(
        'Snapshot preparation did not produce an actual captured Error.'
      )
    // Static listing imports the scalar transport validator before the Node
    // environment exists. Only this actual runtime capture needs server maps.
    const { serializeSourceMappedDiagnostic } =
      require('../reporting/source-mapped-diagnostics') as typeof import('../reporting/source-mapped-diagnostics')
    outcome = {
      kind: 'error',
      diagnostic: serializeSourceMappedDiagnostic(captured, {
        phase: 'runtime',
      }),
      reportedError: { ...captured, type: 'Test Run Error' },
    }
  }
  const failure: SnapshotPreparationFailure = {
    version: 1,
    ...owner,
    phase: 'snapshot-preparation',
    invocation: 0,
    source,
    outcome,
  }
  assertSnapshotPreparationFailure(failure, owner)
  return failure
}

/** Private owning boundaries validate scalar scope; task association is parent-only. */
export function assertSnapshotPreparationFailure(
  value: unknown,
  owner: SnapshotPreparationOwner
): asserts value is SnapshotPreparationFailure {
  const invalid = () => new Error('Invalid owned snapshot preparation failure.')
  if (
    !record(value) ||
    !exact(value, [
      'version',
      'runId',
      'entryId',
      'revision',
      'phase',
      'invocation',
      'source',
      'outcome',
    ]) ||
    data(value, 'version') !== 1 ||
    data(value, 'phase') !== 'snapshot-preparation' ||
    data(value, 'invocation') !== 0 ||
    !['run', 'failed-collection'].includes(data(value, 'source') as string) ||
    typeof owner.runId !== 'string' ||
    !owner.runId ||
    typeof owner.entryId !== 'string' ||
    !owner.entryId ||
    typeof owner.revision !== 'string' ||
    !owner.revision ||
    data(value, 'runId') !== owner.runId ||
    data(value, 'entryId') !== owner.entryId ||
    data(value, 'revision') !== owner.revision
  )
    throw invalid()
  const outcome = data(value, 'outcome')
  if (!record(outcome)) throw invalid()
  if (data(outcome, 'kind') === 'undefined') {
    if (!exact(outcome, ['kind'])) throw invalid()
    return
  }
  if (
    data(outcome, 'kind') !== 'error' ||
    !exact(outcome, ['kind', 'diagnostic', 'reportedError'])
  )
    throw invalid()
  const diagnostic = data(outcome, 'diagnostic')
  const reportedError = data(outcome, 'reportedError')
  if (
    !record(diagnostic) ||
    !record(reportedError) ||
    data(diagnostic, 'phase') !== 'runtime' ||
    data(diagnostic, 'severity') !== 'error' ||
    typeof data(diagnostic, 'message') !== 'string' ||
    typeof data(reportedError, 'message') !== 'string' ||
    data(reportedError, 'type') !== 'Test Run Error'
  )
    throw invalid()
  for (const projection of [diagnostic, reportedError])
    for (const key of ['name', 'stack']) {
      const descriptor = Object.getOwnPropertyDescriptor(projection, key)
      if (
        descriptor &&
        (!('value' in descriptor) ||
          (descriptor.value !== undefined &&
            typeof descriptor.value !== 'string'))
      )
        throw invalid()
    }
}

/** The initial public phase follows actual isolated ordinary executable inputs. */
export function assertPublicSnapshotPreparationRole(
  artifact: import('../contracts').CompiledTestArtifact,
  options: Pick<
    import('../contracts').ExecuteTestOptions,
    | 'preparePublicSnapshots'
    | 'collectOnly'
    | 'coverage'
    | 'customCoverage'
    | 'entry'
  >
) {
  if (options.preparePublicSnapshots === undefined) return
  if (
    options.preparePublicSnapshots !== true ||
    options.collectOnly ||
    options.coverage ||
    options.customCoverage ||
    artifact.kind !== 'node' ||
    artifact.profile.environment !== 'node' ||
    artifact.profile.route !== undefined ||
    artifact.profile.browserClient !== undefined ||
    artifact.cohort ||
    options.entry.typecheck ||
    !/\.(?:js|mjs)$/.test(options.entry.file) ||
    (options.entry.executionEnvironment &&
      options.entry.executionEnvironment.name !== 'node')
  )
    throw new Error(
      'Public snapshot preparation requires isolated one-shot ordinary Node JavaScript execution without active coverage.'
    )
}
