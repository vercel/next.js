import type { OriginalStackFrame } from './stack-frame'

export type StackFramesGroup = {
  moduleGroup?: OriginalStackFrame['sourcePackage']
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
export function groupStackFramesByPackage(
  stackFrames: OriginalStackFrame[]
): StackFramesGroup[] {
  const stackFramesGroupedByFramework: StackFramesGroup[] = []

  for (const stackFrame of stackFrames) {
    const currentGroup =
      stackFramesGroupedByFramework[stackFramesGroupedByFramework.length - 1]
    const moduleGroup = stackFrame.sourcePackage

    if (currentGroup && currentGroup.moduleGroup === moduleGroup) {
      currentGroup.stackFrames.push(stackFrame)
    } else {
      stackFramesGroupedByFramework.push({
        moduleGroup,
        stackFrames: [stackFrame],
      })
    }
  }

  return stackFramesGroupedByFramework
}
