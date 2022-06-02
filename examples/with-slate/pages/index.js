import { useState } from 'react'
import { createEditor } from 'slate'
import { Slate, Editable, withReact } from 'slate-react'
import { withHistory } from 'slate-history'

export default function IndexPage() {
  const [editor] = useState(() => withReact(withHistory(createEditor())), [])
  const [value, setValue] = useState([
    {
      children: [
        { text: 'This is editable plain text, just like a <textarea>!' },
      ],
    },
  ])

  return (
    <Slate editor={editor} value={value} onChange={setValue}>
      <Editable placeholder="Enter some plain text..." />
    </Slate>
  )
}
