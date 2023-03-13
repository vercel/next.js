import { useState } from 'react'
import { createEditor, Descendant } from 'slate'
import { Slate, Editable, withReact } from 'slate-react'
import { withHistory } from 'slate-history'
import { InferGetServerSidePropsType } from 'next'

export async function getServerSideProps() {
  return {
    props: {
      editorState: [
        {
          children: [
            { text: 'This is editable plain text, just like a <textarea>!' },
          ],
        },
      ],
    },
  }
}

async function saveEditorState(edtorState: Descendant[]) {
  const response = await fetch('/api/editor-state', {
    method: 'POST',
    body: JSON.stringify(edtorState),
  })
  return response.json()
}

export default function IndexPage({
  editorState,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [editor] = useState(() => withReact(withHistory(createEditor())))
  return (
    <Slate
      editor={editor}
      value={editorState}
      onChange={async (value) => {
        const isAstChange = editor.operations.some(
          (op) => 'set_selection' !== op.type
        )
        if (isAstChange) {
          // You might want to debounce the following call!
          const responseData = await saveEditorState(value)
          console.log('Send editor state to the server', responseData)
        }
      }}
    >
      <Editable placeholder="Enter some plain text..." />
    </Slate>
  )
}
