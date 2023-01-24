import React from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'

export function ComponentStackFrameRow({
  componentStackFrame: { component, file, lineNumber, column },
}: {
  componentStackFrame: ComponentStackFrame
}) {
  const open = useOpenInEditor({
    file,
    column,
    lineNumber,
  })

  return (
    <div data-nextjs-component-stack-frame>
      <h6>{component}</h6>
      {file ? (
        <div
          tabIndex={10} // match CallStackFrame
          role={'link'}
          onClick={open}
          title={'Click to open in your editor'}
        >
          <span>
            {file} ({lineNumber}:{column})
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </div>
      ) : null}
    </div>
  )
}
