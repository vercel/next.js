import { nanoid } from 'nanoid'

export default function Page() {
  return (
    <>
      <h1>Static Page</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
