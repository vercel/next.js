import { nanoid } from 'nanoid'
import { headers } from 'next/headers'

export default async function Page() {
  await headers()
  return (
    <>
      <h1>Dynamic Page</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
