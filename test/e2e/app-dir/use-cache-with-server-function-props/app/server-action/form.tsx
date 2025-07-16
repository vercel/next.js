'use client'

import { useActionState } from 'react'

export function Form({
  sayHi,
  sayHello,
}: {
  sayHi: () => Promise<string>
  sayHello: () => Promise<string>
}) {
  const [hi, hiAction, isHiPending] = useActionState(sayHi, null)
  const [hello, helloAction, isHelloPending] = useActionState(sayHello, null)

  return (
    <form action={hiAction}>
      <button id="submit-button-hi">Say Hi</button>{' '}
      <button id="submit-button-hello" formAction={helloAction}>
        Say Hello
      </button>
      <p id="hi">{isHiPending ? 'loading...' : hi}</p>
      <p id="hello">{isHelloPending ? 'loading...' : hello}</p>
    </form>
  )
}
