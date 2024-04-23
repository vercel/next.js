import type { StackFramesGroup } from '../../helpers/group-stack-frames-by-framework'
import { CallStackFrame } from './CallStackFrame'
import { CollapseIcon } from '../../icons/CollapseIcon'
import { FrameworkIcon } from '../../icons/FrameworkIcon'

function FrameworkGroup({
  framework,
  stackFrames,
}: {
  framework: NonNullable<StackFramesGroup['framework']>
  stackFrames: StackFramesGroup['stackFrames']
}) {
  return (
    <details data-nextjs-collapsed-call-stack-details>
      {/* Match CallStackFrame tabIndex */}
      <summary tabIndex={10}>
        <CollapseIcon />
        <FrameworkIcon framework={framework} />
        {framework === 'react' ? 'React' : 'Next.js'}
      </summary>
      {stackFrames.map((frame, index) => (
        <CallStackFrame key={`call-stack-${index}`} frame={frame} />
      ))}
    </details>
  )
}

export function GroupedStackFrames({
  groupedStackFrames,
  show,
}: {
  groupedStackFrames: StackFramesGroup[]
  show: boolean
}) {
  if (!show) return
  return (
    <>
      {groupedStackFrames.map((stackFramesGroup, groupIndex) => {
        // Collapse React and Next.js frames
        if (stackFramesGroup.framework) {
          return (
            <FrameworkGroup
              key={`call-stack-framework-group-${groupIndex}`}
              framework={stackFramesGroup.framework}
              stackFrames={stackFramesGroup.stackFrames}
            />
          )
        }

        return (
          // Don't group non React and Next.js frames
          stackFramesGroup.stackFrames.map((frame, frameIndex) => (
            <CallStackFrame
              key={`call-stack-${groupIndex}-${frameIndex}`}
              frame={frame}
            />
          ))
        )
      })}
    </>
  )
}
