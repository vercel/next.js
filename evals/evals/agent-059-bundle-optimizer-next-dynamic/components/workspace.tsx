'use client'

import { useState } from 'react'
import { HeavyEditor } from './heavy-editor'

export function Workspace() {
  const [showEditor, setShowEditor] = useState(false)
  const [formula, setFormula] = useState('revenue - costs')

  return (
    <section>
      <p>Build and test a formula before adding it to the dashboard.</p>
      <button onClick={() => setShowEditor(true)}>Open formula editor</button>
      {showEditor ? (
        <HeavyEditor value={formula} onChange={setFormula} />
      ) : null}
    </section>
  )
}
