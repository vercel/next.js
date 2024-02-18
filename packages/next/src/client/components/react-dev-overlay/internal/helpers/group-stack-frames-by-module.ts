import type { OriginalStackFrame } from './stack-frame'

export type StackFramesGroup = {
  moduleGroup?: OriginalStackFrame['sourceModule']
  stackFrames: OriginalStackFrame[]
}

/** TODO: Move this to react-dev-overlay/server/middleware.ts */
function getModuleGroup(file: string | null): StackFramesGroup['moduleGroup'] {
  if (!file) return
  // Should we maybe want to group Node.js errors too?
  // if (file.startsWith('node:internal/')) return 'node'
  else if (file.startsWith('webpack://next/dist/compiled/react')) return 'react'
  else if (file.startsWith('webpack://next/')) return 'next'
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
export function groupStackFramesByModule(
  stackFrames: OriginalStackFrame[]
): StackFramesGroup[] {
  const stackFramesGroupedByFramework: StackFramesGroup[] = []

  for (const stackFrame of stackFrames) {
    const currentGroup =
      stackFramesGroupedByFramework[stackFramesGroupedByFramework.length - 1]
    // TODO: should come from react-dev-overlay/server/middleware.ts
    // const framework = stackFrame.sourcePackage
    const moduleGroup = getModuleGroup(stackFrame.sourceStackFrame.file)

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
