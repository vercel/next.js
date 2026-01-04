'use client'
import { useActionState } from 'react'
import { complexAction } from './actions'

type ComplexResult = {
  nested: {
    value: string
    deep: { array: number[] }
  }
  array: string[]
  timestamp: number
  cachedTimestamp: string
} | null

export default function Page() {
  const [state, formAction, isPending] = useActionState(
    complexAction,
    null as ComplexResult
  )

  return (
    <div>
      <p id="cached-timestamp">{state?.cachedTimestamp ?? 'none'}</p>
      <p id="result">
        {state
          ? `nested: ${state.nested.value}, array: ${state.array.join(',')}, deep: ${state.nested.deep.array.join(',')}`
          : 'no result yet'}
      </p>
      <p id="pending">{isPending ? 'pending' : 'idle'}</p>
      <form action={formAction}>
        <button id="complex-action" type="submit">
          Complex Action
        </button>
      </form>
    </div>
  )
}
