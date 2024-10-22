import { nanoid } from 'nanoid'
import ClientComponent from './component'

export default async function Page(props) {
  const searchParams = await props.searchParams
  return (
    <>
      <ClientComponent searchParams={searchParams} />
      <p id="nanoid">{nanoid()}</p>
    </>
  )
}
