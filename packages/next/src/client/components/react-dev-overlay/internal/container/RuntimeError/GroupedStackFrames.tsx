import type { StackFramesGroup } from '../../helpers/group-stack-frames-by-framework'
import { CallStackFrame } from './CallStackFrame'
import { FrameworkIcon } from './FrameworkIcon'

const chevronIcon = (
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
)

function FrameworkGroup({
  framework,
  stackFrames,
  all,
}: {
  framework: NonNullable<StackFramesGroup['framework']>
  stackFrames: StackFramesGroup['stackFrames']
  all: boolean
}) {
  return (
    <details data-nextjs-collapsed-call-stack-details>
      {/* Match CallStackFrame tabIndex */}
      <summary tabIndex={10}>
        {chevronIcon}
        <FrameworkIcon framework={framework} />
        {framework === 'react' ? 'React' : 'Next.js'}
      </summary>
      {stackFrames.map((frame, index) => (
        <CallStackFrame key={`call-stack-${index}-${all}`} frame={frame} />
      ))}
    </details>
  )
}

export function GroupedStackFrames(props: {
  groupedStackFrames: StackFramesGroup[]
  all: boolean
}) {
  const { groupedStackFrames, all } = props
  return (
    <>
      {groupedStackFrames.map((stackFramesGroup, groupIndex) => {
        // Collapse React and Next.js frames
        if (stackFramesGroup.framework) {
          return (
            <FrameworkGroup
              key={`call-stack-framework-group-${groupIndex}-${all}`}
              framework={stackFramesGroup.framework}
              stackFrames={stackFramesGroup.stackFrames}
              all={all}
            />
          )
        }

        return (
          // Don't group non React and Next.js frames
          stackFramesGroup.stackFrames.map((frame, frameIndex) => (
            <CallStackFrame
              key={`call-stack-${groupIndex}-${frameIndex}-${all}`}
              frame={frame}
            />
          ))
        )
      })}
    </>
  )
}
