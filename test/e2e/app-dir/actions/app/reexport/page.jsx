'use client'

import { action } from './index'
import { bar } from './nested'

export default function Page() {
  return (
    <>
      <form action={action}>
        <button type="submit" id="test-1">
          Submit
        </button>
      </form>
      <button
        onClick={async () => {
          const foo = await bar()
          await foo()
        }}
        id="test-2"
      >
        Submit
      </button>
    </>
  )
}
