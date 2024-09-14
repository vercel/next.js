'use client'

import { foo } from '../actions'

export default function Page() {
  return (
    <form action={foo}>
      <button type="submit">Submit</button>
    </form>
  )
}
