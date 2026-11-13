'use client'

import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

const notes = `## Quarterly plan

- Ship the browser performance work
- Keep the release notes readable

\`\`\`js
const target = 'fast initial load'
\`\`\`
`

export function ReleaseNotes() {
  return (
    <article>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {notes}
      </ReactMarkdown>
    </article>
  )
}
