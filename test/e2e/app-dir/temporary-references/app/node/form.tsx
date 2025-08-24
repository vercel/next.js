'use client'

import { useActionState } from 'react'

export function Form({
  action,
}: {
  action: (obj: object | null) => Promise<object | null>
}) {
  const [result, formAction] = useActionState(async () => {
    const objA = {}
    const objB = await action(objA)

    return objA === objB ? 'identical' : 'kaputt!'
  }, 'initial')

  return (
    <form action={formAction}>
      <button>Submit</button>
      <p>{result}</p>
    </form>
  )
}
