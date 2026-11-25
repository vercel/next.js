'use client'

import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'

export function HeavyEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <CodeMirror
      value={value}
      height="240px"
      extensions={[javascript({ jsx: true })]}
      onChange={onChange}
    />
  )
}
