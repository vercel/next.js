import { nanoid } from 'nanoid'

export default function Page() {
  return (
    <>
      <h1>No searchParams used</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
