'use client'

import { bar } from '../actions'

export default function Page() {
  return (
    <form action={bar}>
      <button type="submit">Submit</button>
    </form>
  )
}
