'use client'

import { useActionState } from 'react'

export function Form({
  echoAction,
}: {
  echoAction: (value: string) => Promise<string>
}) {
  let [result, formAction] = useActionState(
    () => echoAction(new Array(100000).fill('あ').join('')),
    null
  )

  let aCount = result ? result.match(/あ/g)!.length : 0

  return (
    <form action={formAction}>
      {result && (
        <p>
          Server responded with {aCount} あ characters and{' '}
          {result.length - aCount} � characters.
        </p>
      )}
      <button>Submit</button>
    </form>
  )
}
