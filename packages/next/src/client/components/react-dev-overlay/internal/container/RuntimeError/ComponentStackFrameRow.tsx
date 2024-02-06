import React from 'react'
import type { ComponentStackFrame } from '../../helpers/parse-component-stack'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'

function EditorLink({
  children,
  componentStackFrame: { file, column, lineNumber },
}: {
  children: React.ReactNode
  componentStackFrame: ComponentStackFrame
}) {
  const open = useOpenInEditor({
    file,
    column,
    lineNumber,
  })

  return (
    <div
      tabIndex={10} // match CallStackFrame
      role={'link'}
      onClick={open}
      title={'Click to open in your editor'}
    >
      {children}
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
  )
}

function formatLineNumber(lineNumber: number, column: number | undefined) {
  if (!column) {
    return lineNumber
  }

  return `${lineNumber}:${column}`
}

function LocationLine({
  componentStackFrame,
}: {
  componentStackFrame: ComponentStackFrame
}) {
  const { file, lineNumber, column } = componentStackFrame
  return (
    <>
      {file} {lineNumber ? `(${formatLineNumber(lineNumber, column)})` : ''}
    </>
  )
}

function SourceLocation({
  componentStackFrame,
}: {
  componentStackFrame: ComponentStackFrame
}) {
  const { file, canOpenInEditor } = componentStackFrame

  if (file && canOpenInEditor) {
    return (
      <EditorLink componentStackFrame={componentStackFrame}>
        <span>
          <LocationLine componentStackFrame={componentStackFrame} />
        </span>
      </EditorLink>
    )
  }

  return (
    <div>
      <LocationLine componentStackFrame={componentStackFrame} />
    </div>
  )
}

export function ComponentStackFrameRow({
  componentStackFrame,
}: {
  componentStackFrame: ComponentStackFrame
}) {
  const { component } = componentStackFrame

  return (
    <div data-nextjs-component-stack-frame>
      <h3>{component}</h3>
      <SourceLocation componentStackFrame={componentStackFrame} />
    </div>
  )
}
