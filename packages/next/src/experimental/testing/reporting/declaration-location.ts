import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { getTestStackFrames, isTestFrameOriginal } from './test-stack-frames'
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
  const selected = getTestStackFrames(stack).find((candidate) => {
    const frame = candidate.frame
    if (
      !isTestFrameOriginal(candidate) ||
      !frame.file ||
      !frame.line1 ||
      !frame.column1
    )
      return false
    const file = frame.file.startsWith('file:')
      ? fileURLToPath(frame.file)
      : resolve(frame.file)
    return file === resolve(testPath)
  })
  const frame = selected?.frame
  if (frame?.line1 && frame.column1)
    return { line: frame.line1, column: frame.column1 }
}
