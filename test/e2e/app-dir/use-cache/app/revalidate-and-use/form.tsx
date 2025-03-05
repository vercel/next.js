'use client'

import { useActionState } from 'react'

export function Form({
  revalidateAction,
  initialValue,
}: {
  revalidateAction: (type: 'tag' | 'path') => Promise<number>
  initialValue: number
}) {
  const [result, revalidate, isPending] = useActionState(
    async (_state: number, type: 'tag' | 'path') => revalidateAction(type),
    initialValue
  )

  return (
    <form>
      <p>{result}</p>
      <button
        id="revalidate-tag"
        formAction={() => revalidate('tag')}
        disabled={isPending}
      >
        Revalidate Tag
      </button>
      <button
        id="revalidate-path"
        formAction={() => revalidate('path')}
        disabled={isPending}
      >
        Revalidate Path
      </button>
    </form>
  )
}
