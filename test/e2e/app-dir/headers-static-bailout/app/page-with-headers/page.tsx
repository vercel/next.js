import { nanoid } from 'nanoid'
import { headers } from 'next/headers'

export default function Page() {
  headers()
  return (
    <>
      <h1>Dynamic Page</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
