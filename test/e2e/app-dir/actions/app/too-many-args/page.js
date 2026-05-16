'use client'

import { action } from './actions'

// Bind the action with 1000 arguments. React will add the form data as the last
// argument when invoked, exceeding the limit.
const boundAction = action.bind(null, ...Array(1000).fill(0))

export default function Page() {
  return (
    <form action={boundAction}>
      <button id="submit">Submit</button>
    </form>
  )
}
