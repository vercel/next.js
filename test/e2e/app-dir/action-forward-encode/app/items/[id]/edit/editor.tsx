'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { saveDraft } from './actions'
import { itemActionRegistry } from '../../../item-action-registry'

export default function Editor() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    itemActionRegistry.saveDraft = saveDraft
    setReady(true)
  }, [])

  return (
    <div>
      <p id="editor">{ready ? 'ready' : 'loading'}</p>
      <Link id="back" href="/items/1">
        Back to item
      </Link>
    </div>
  )
}
