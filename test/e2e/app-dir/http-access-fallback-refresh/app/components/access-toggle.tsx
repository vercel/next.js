'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function AccessToggle({ access }: { access: 'grant' | 'revoke' }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isGrant = access === 'grant'

  return (
    <button
      id={isGrant ? 'grant-access' : 'revoke-access'}
      disabled={isPending}
      onClick={() => {
        document.cookie = isGrant
          ? 'refresh-access=granted; path=/; SameSite=Lax'
          : 'refresh-access=; path=/; max-age=0; SameSite=Lax'
        startTransition(() => router.refresh())
      }}
    >
      {isGrant ? 'Grant access' : 'Revoke access'}
    </button>
  )
}
