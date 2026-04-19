'use client'

import { useTransition } from 'react'

export function RevalidateButtons({
  revalidatePath,
}: {
  revalidatePath: () => Promise<void>
}) {
  const [isPending, startTransition] = useTransition()

  return (
    <form>
      <button id="revalidate-path" formAction={revalidatePath}>
        revalidate with revalidatePath()
      </button>{' '}
      <button
        id="revalidate-api-route"
        disabled={isPending}
        formAction={async () => {
          startTransition(async () => {
            await fetch('/api/revalidate?path=/on-demand-revalidate', {
              method: 'POST',
            })
          })
        }}
      >
        revalidate with API route
      </button>
    </form>
  )
}
