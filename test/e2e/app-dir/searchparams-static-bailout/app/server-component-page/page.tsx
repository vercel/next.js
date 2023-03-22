import { nanoid } from 'nanoid'

export default function Page({ searchParams }) {
  return (
    <>
      <h1>Parameter: {searchParams.search}</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
