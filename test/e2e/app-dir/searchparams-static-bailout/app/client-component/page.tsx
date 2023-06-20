import { nanoid } from 'nanoid'
import ClientComponent from './component'

export default function Page({ searchParams }) {
  return (
    <>
      <ClientComponent searchParams={searchParams} />
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
