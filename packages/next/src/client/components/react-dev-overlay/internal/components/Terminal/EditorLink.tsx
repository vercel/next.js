import React from 'react'
import { useOpenInEditor } from '../../helpers/use-open-in-editor'

export function EditorLink({ file }: { file: string }) {
  const open = useOpenInEditor({
    file,
    column: 1,
    lineNumber: 1,
  })

  return (
    <div
      data-with-open-in-editor-link
      tabIndex={10}
      role={'link'}
      onClick={open}
      title={'Click to open in your editor'}
    >
      {file}
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
