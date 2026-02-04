'use client'

import { useTransition } from 'react'
import { action } from './actions'

export default function Page() {
  const [, startTransition] = useTransition()

  return (
    <main>
      <p>
        This button will call a server action and pass something unserializable
        like a class instance. We expect this action to error with a reasonable
        message explaning what happened
      </p>
      <button
        id="submit"
        onClick={async () => {
          await action(new Foo())
        }}
      >
        Submit
      </button>

      <button
        id="submit-transition"
        onClick={async () => {
          startTransition(() => action())
        }}
      >
        Action that triggers an error
      </button>
    </main>
  )
}

class Foo {
  value = 42
}
