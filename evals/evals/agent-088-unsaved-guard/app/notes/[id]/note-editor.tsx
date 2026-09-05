'use client'

import Link from 'next/link'
import { useState } from 'react'

export function NoteEditor({
  id,
  title,
  initialBody,
}: {
  id: string
  title: string
  initialBody: string
}) {
  const [body, setBody] = useState(initialBody)
  const [savedBody, setSavedBody] = useState(initialBody)
  const dirty = body !== savedBody

  return (
    <main>
      <nav>
        <Link href="/notes" data-testid="nav-notes">
          All notes
        </Link>{' '}
        <Link href="/settings" data-testid="nav-settings">
          Settings
        </Link>
      </nav>
      <h1>{title}</h1>
      <textarea
        data-testid="note-textarea"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={8}
        cols={60}
      />
      <p data-testid="save-state">
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </p>
      <button data-testid="save-button" onClick={() => setSavedBody(body)}>
        Save note {id}
      </button>
    </main>
  )
}
