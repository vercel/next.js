'use client'

import { useState } from 'react'
import { startCase } from 'lodash'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { legacyLabel } from 'legacy-widget'
import { HeavyEditor } from './heavy-editor'

const notes = `## Quarterly plan

- Ship the browser performance work
- Keep the editor interaction

\`\`\`js
const target = 'fast initial load'
\`\`\`
`

export function Workspace() {
  const [showEditor, setShowEditor] = useState(false)
  const [formula, setFormula] = useState('revenue - costs')

  return (
    <section>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {notes}
      </ReactMarkdown>

      <p>Current status: {startCase('ready for review')}</p>
      <p>Legacy status: {legacyLabel('legacy panel')}</p>

      <button onClick={() => setShowEditor(true)}>Open formula editor</button>
      {showEditor ? (
        <HeavyEditor value={formula} onChange={setFormula} />
      ) : null}
    </section>
  )
}
