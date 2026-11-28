'use client'

import { useActionState } from 'react'

export function ActionTrigger({
  id,
  action,
}: {
  id: string
  action: () => Promise<string>
}) {
  const [result, formAction] = useActionState(action, '')

  return (
    <form action={formAction}>
      <button id={`btn-${id}`}>Run {id}</button>
      <p id={`res-${id}`}>{result}</p>
    </form>
  )
}
