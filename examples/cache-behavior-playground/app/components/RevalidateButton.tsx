'use client'

import { useTransition } from 'react'

interface RevalidateButtonProps {
  action: () => Promise<void>
  label?: string
}

export function RevalidateButton({
  action,
  label = 'Revalidate',
}: RevalidateButtonProps) {
  const [isPending, startTransition] = useTransition()

  return (
    <button
      onClick={() => startTransition(() => action())}
      disabled={isPending}
    >
      {isPending ? 'Revalidating...' : label}
    </button>
  )
}
