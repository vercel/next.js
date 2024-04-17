'use client'

import { action } from './actions'

export default function Page() {
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
    </main>
  )
}

class Foo {}
