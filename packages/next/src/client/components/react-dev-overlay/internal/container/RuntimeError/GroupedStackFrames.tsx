import type { StackFramesGroup } from '../../helpers/group-stack-frames-by-framework'
import { CallStackFrame } from './CallStackFrame'
import { FrameworkIcon } from './FrameworkIcon'

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
        <svg
          data-nextjs-call-stack-chevron-icon
          fill="none"
          height="20"
          width="20"
          shapeRendering="geometricPrecision"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
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
