import React, { type ReactNode } from 'react'
import type { StackFrame } from 'next/dist/compiled/stacktrace-parser'
import {
  getFrameSource,
  type OriginalStackFrame,
} from '../../helpers/stack-frame'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { ExternalLink } from '../../icons'

export function CallStackFrame({
  frame,
}: {
  frame: OriginalStackFrame
}): ReactNode {
  // TODO: ability to expand resolved frames
  // TODO: render error or external indicator

  const f: StackFrame = frame.originalStackFrame ?? frame.sourceStackFrame
  const hasSource = Boolean(frame.originalCodeFrame)
  const open = useOpenInEditor(
    hasSource
      ? {
          file: f.file,
          lineNumber: f.lineNumber,
          column: f.column,
        }
      : undefined
  )

  return (
    <li
      className="call-stack-frame"
      data-expanded={Boolean(frame.expanded)}
      data-nextjs-call-stack-frame
    >
      <h3>{f.methodName}</h3>
      <div
        data-has-source={hasSource ? 'true' : undefined}
        tabIndex={hasSource ? 10 : undefined}
        role={hasSource ? 'link' : undefined}
        onClick={open}
        title={hasSource ? 'Click to open in your editor' : undefined}
      >
        <span>{getFrameSource(f)}</span>
        <ExternalLink />
      </div>
    </li>
  )
}
