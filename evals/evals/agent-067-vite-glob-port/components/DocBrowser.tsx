'use client'

import { useState } from 'react'
import { docs } from '../docs-index'

export default function DocBrowser() {
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const paths = Object.keys(docs).sort()

  if (paths.length === 0) {
    return <p id="empty-state">No documents found.</p>
  }

  return (
    <div>
      <ul id="doc-list">
        {paths.map((path) => (
          <li key={path}>
            <button
              onClick={async () => {
                setOpenDoc(path)
                setBody(await docs[path]())
              }}
            >
              {path}
            </button>
          </li>
        ))}
      </ul>
      {body !== null && (
        <article id="doc-body" data-doc={openDoc ?? undefined}>
          <pre>{body}</pre>
        </article>
      )}
    </div>
  )
}
