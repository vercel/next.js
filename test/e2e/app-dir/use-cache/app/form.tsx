'use client'

import { useActionState } from 'react'

export function Form({
  foo,
  bar,
  baz,
}: {
  foo: () => Promise<number>
  bar: () => Promise<number>
  baz: () => Promise<number>
}) {
  const [result, dispatch] = useActionState<
    [number, number, number],
    'submit' | 'reset'
  >(
    async (_state, event) => {
      if (event === 'reset') {
        return [0, 0, 0]
      }

      return [await foo(), await bar(), await baz()]
    },
    [0, 0, 0]
  )

  return (
    <form action={() => dispatch('submit')}>
      <button id="submit-button">Submit</button>{' '}
      <button id="reset-button" formAction={() => dispatch('reset')}>
        Reset
      </button>
      <p>
        {result[0]} {result[1]} {result[2]}
      </p>
    </form>
  )
}
