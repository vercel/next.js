import * as React from 'react'

import { BaseIcon, type IconProps } from '../../icons/BaseIcon'
import { clsx } from '../../helpers/clsx'
import type { StackFramesGroup } from '../../helpers/group-stack-frames-by-framework'

import { CallStackFrame } from './CallStackFrame'
import { FrameworkIcon } from './FrameworkIcon'

function FrameworkGroup({
  framework,
  stackFrames,
  all,
}: {
  framework: NonNullable<StackFramesGroup['framework']>
  stackFrames: StackFramesGroup['stackFrames']
  all: boolean
}): React.ReactNode {
  return (
    <li>
      <details
        data-nextjs-collapsed-call-stack-details
        className="collapsed-call-stack-details"
      >
        <summary
          tabIndex={10} // Match CallStackFrame tabIndex
        >
          <Chevron />
          <FrameworkIcon framework={framework} />
          {framework === 'react' ? 'React' : 'Next.js'}
        </summary>

        <ul className="call-stack-frames">
          {stackFrames.map((frame, index) => (
            <CallStackFrame key={`call-stack-${index}-${all}`} frame={frame} />
          ))}
        </ul>
      </details>
    </li>
  )
}

function Chevron({ className, ...rest }: IconProps): React.ReactNode {
  return (
    <BaseIcon
      size="20"
      shapeRendering="geometricPrecision"
      {...rest}
      className={clsx('chevron', className)}
    >
      <path d="M9 18l6-6-6-6" />
    </BaseIcon>
  )
}

export function GroupedStackFrames({
  groupedStackFrames,
  all,
}: {
  groupedStackFrames: StackFramesGroup[]
  all: boolean
}): React.ReactNode {
  return (
    <ul className="call-stack-frames">
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
    </ul>
  )
}
