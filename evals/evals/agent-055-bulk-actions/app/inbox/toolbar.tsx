'use client'

import { useTransition } from 'react'
import { archiveMessage } from '../../lib/actions'

export function Toolbar({ ids }: { ids: string[] }) {
  const [pending, startTransition] = useTransition()
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await Promise.all(ids.map((id) => archiveMessage(id)))
        })
      }
    >
      Archive all
    </button>
  )
}
