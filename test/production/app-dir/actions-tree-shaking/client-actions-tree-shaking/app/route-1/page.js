'use client'

import { foo } from '../actions'

export default function Page() {
  return (
    <form action={foo}>
      <button type="submit" id="submit">
        Submit
      </button>
    </form>
  )
}
