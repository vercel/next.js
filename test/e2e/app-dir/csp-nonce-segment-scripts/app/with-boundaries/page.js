import { connection } from 'next/server'
import { Marker } from './marker'
import { PageOnly } from './page-only'

export default async function Page() {
  await connection()
  return (
    <>
      <Marker id="page" />
      <PageOnly />
    </>
  )
}
