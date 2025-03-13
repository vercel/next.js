'use client'

import { useActionState } from 'react'

export function Form({
  revalidateAction,
  initialValues,
}: {
  revalidateAction: (type: 'tag' | 'path') => Promise<[number, string]>
  initialValues: [number, string]
}) {
  const [[useCacheValue, fetchedValue], revalidate, isPending] = useActionState(
    async (_state: [number, string], type: 'tag' | 'path') =>
      revalidateAction(type),
    initialValues
  )

  return (
    <form>
      <p id="use-cache-value">{useCacheValue}</p>
      <p id="fetched-value">{fetchedValue}</p>
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
