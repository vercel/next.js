import type { Task, Test, TestArtifact, TestArtifactLocation } from './tasks'
import {
  prepareAnnotationAttachment,
  retainAnnotationAttachment,
} from './annotations'

interface ArtifactRecorder {
  getLocation?(error: Error): TestArtifactLocation | undefined
  projectDir: string
  attachmentsDir?: string
  record(artifact: TestArtifact): void | Promise<void>
  transport?(artifact: TestArtifact): Promise<TestArtifact>
  isOpen(): boolean
}
const taskRecorders = new WeakMap<Task, ArtifactRecorder>()

/** Register the explicit task in its existing file; earlier finished tasks remain addressable. */
export function registerTaskArtifactRecorder(
  task: Task,
  recorder: ArtifactRecorder
) {
  taskRecorders.set(task, recorder)
  return () => {
    if (taskRecorders.get(task) === recorder) taskRecorders.delete(task)
  }
}

/** Records Node artifact data; live custom reporter callbacks are a separate adapter. */
export async function recordArtifact<Artifact extends TestArtifact>(
  task: Test,
  artifact: Artifact
): Promise<Artifact> {
  const recorder = taskRecorders.get(task)
  if (!recorder || !recorder.isOpen())
    throw new Error("Test runner doesn't support test artifacts.")
  const callsite = new Error('STACK_TRACE')
  Error.captureStackTrace?.(callsite, recordArtifact)
  const location = recorder.getLocation?.(callsite)
  if (location) {
    artifact.location = location
    if (artifact.type === 'internal:annotation')
      artifact.annotation.location = location
  }
  if (Array.isArray(artifact.attachments))
    for (const attachment of artifact.attachments)
      prepareAnnotationAttachment(attachment)
  // This low-level annotation operation intentionally does not call context.annotate.
  if (artifact.type === 'internal:annotation') return artifact
  if (recorder.transport) {
    const resolved = (await recorder.transport(artifact)) as Artifact
    task.artifacts.push(resolved)
    return resolved
  }
  // Like the worker/controller round trip, resolve a separate value after entry normalization.
  await Promise.resolve()
  const resolved = structuredClone(artifact)
  if (Array.isArray(resolved.attachments))
    await Promise.all(
      resolved.attachments.map((attachment) =>
        retainAnnotationAttachment(attachment, '', recorder)
      )
    )
  if (!recorder.isOpen())
    throw new Error('Cannot record artifacts after the Next test file closed.')
  await recorder.record(resolved)
  task.artifacts.push(resolved)
  return resolved
}
