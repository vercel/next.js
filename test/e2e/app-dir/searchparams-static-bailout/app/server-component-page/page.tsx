import { nanoid } from 'nanoid'

export default async function Page({ searchParams }) {
  return (
    <>
      <h1>Parameter: {(await searchParams).search}</h1>
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
