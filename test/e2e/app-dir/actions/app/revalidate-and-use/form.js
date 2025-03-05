'use client'

import { useActionState } from 'react'

export function Form({ revalidateAction, initialValue }) {
  const [result, revalidate, isPending] = useActionState(
    async (_state, type) => revalidateAction(type),
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
