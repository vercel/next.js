'use client'

import { action } from '../actions'
import { getFoo } from '../nested'

export default function Page() {
  return (
    <>
      <form action={action}>
        <button type="submit" id="test-1">
          Test 1 Submit
        </button>
      </form>
      <button
        onClick={async () => {
          const foo = await getFoo()
          await foo()
        }}
        id="test-2"
      >
        Test 2 Submit
      </button>
    </>
  )
}
