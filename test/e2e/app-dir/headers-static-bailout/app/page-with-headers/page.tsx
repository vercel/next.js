import { nanoid } from 'nanoid'
import { headers } from 'next/headers'

export default function Page() {
  headers()
  return (
    <>
      <p>Dynamic Page</p>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
