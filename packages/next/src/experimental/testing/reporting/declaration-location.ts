import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { getSourceMappedStackFrames } from '../../../server/patch-error-inspect'
import type { TaskLocation } from '../runner/tasks'

/** Declaration positions preserve the actual engine column of the selected frame. */
export function mapTestDeclarationLocation(
  error: Error,
  testPath: string
): TaskLocation | undefined {
  let stack: unknown
  try {
    stack = error.stack
  } catch {
    return
  }
  if (typeof stack !== 'string') return
  const frame = getSourceMappedStackFrames(stack).find((candidate) => {
    if (
      !candidate.original ||
      !candidate.file ||
      !candidate.line1 ||
      !candidate.column1
    )
      return false
    const file = candidate.file.startsWith('file:')
      ? fileURLToPath(candidate.file)
      : resolve(candidate.file)
    return file === resolve(testPath)
  })
  if (frame?.line1 && frame.column1)
    return { line: frame.line1, column: frame.column1 }
}
