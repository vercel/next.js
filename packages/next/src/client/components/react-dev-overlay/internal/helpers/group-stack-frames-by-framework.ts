import type { SourcePackage } from '../../server/shared'
import type { OriginalStackFrame } from './stack-frame'

export type StackFramesGroup = {
  framework?: SourcePackage | null
  stackFrames: OriginalStackFrame[]
}

/**
 * Group sequences of stack frames by framework.
 *
 * Given the following stack frames:
 * Error
 *   user code
 *   user code
 *   react
 *   react
 *   next
 *   next
 *   react
 *   react
 *
 * The grouped stack frames would be:
 * > user code
 * > react
 * > next
 * > react
 *
 */
export function groupStackFramesByFramework(
  stackFrames: OriginalStackFrame[]
): StackFramesGroup[] {
  const stackFramesGroupedByFramework: StackFramesGroup[] = []

  for (const stackFrame of stackFrames) {
    const currentGroup =
      stackFramesGroupedByFramework[stackFramesGroupedByFramework.length - 1]
    const framework = stackFrame.sourcePackage

    if (currentGroup && currentGroup.framework === framework) {
      currentGroup.stackFrames.push(stackFrame)
    } else {
      stackFramesGroupedByFramework.push({
        framework: framework,
        stackFrames: [stackFrame],
      })
    }
  }

  return stackFramesGroupedByFramework
}
