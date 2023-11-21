import React, { type ReactNode } from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'
import { ExternalLink } from '../../icons'

export function ComponentStackFrameRow({
  componentStackFrame: { component, file, lineNumber, column },
}: {
  componentStackFrame: ComponentStackFrame
}): ReactNode {
  const open = useOpenInEditor({
    file,
    column,
    lineNumber,
  })

  return (
    <div data-nextjs-component-stack-frame className="component-stack-frame">
      <h3>{component}</h3>
      {file ? (
        <div
          tabIndex={0} // match CallStackFrame
          role={'link'}
          onClick={open}
          title={'Click to open in your editor'}
        >
          <span>
            {file} ({lineNumber}:{column})
          </span>
          <ExternalLink />
        </div>
      ) : null}
    </div>
  )
}
