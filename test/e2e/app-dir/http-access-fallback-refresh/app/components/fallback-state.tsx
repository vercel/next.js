'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

export function FallbackState() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState('')
  const [mountId, setMountId] = useState('')
  const didSetMountId = useRef(false)

  useEffect(() => {
    if (!didSetMountId.current) {
      didSetMountId.current = true
      setMountId(crypto.randomUUID())
    }
  }, [])

  return (
    <>
      <label>
        Fallback state
        <input
          id="fallback-state"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <output id="fallback-mount-id">{mountId}</output>
      <button
        id="refresh-not-found"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
      >
        Refresh while not found
      </button>
    </>
  )
}
