'use client'

import { useActionState } from 'react'
import { bar, baz } from './cached'

export default function Page() {
  const [result, dispatch] = useActionState<
    [number, number],
    'submit' | 'reset'
  >(
    async (_state, event) => {
      if (event === 'reset') {
        return [0, 0]
      }

      return [await bar(), await baz()]
    },
    [0, 0]
  )

  return (
    <form action={() => dispatch('submit')}>
      <button id="submit-button">Click me</button>
      <p>
        {result[0]} {result[1]}
      </p>
      <button id="reset-button" formAction={() => dispatch('reset')}>
        Reset
      </button>
    </form>
  )
}
