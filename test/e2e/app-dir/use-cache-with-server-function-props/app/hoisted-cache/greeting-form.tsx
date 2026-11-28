'use client'

import { useActionState } from 'react'

export function GreetingForm({
  greetAction,
}: {
  greetAction: () => Promise<string>
}) {
  const [greeting, formAction] = useActionState(greetAction, '')

  return (
    <form action={formAction}>
      <button id="submit-greeting">Greet</button>
      <p id="greeting">{greeting}</p>
    </form>
  )
}
