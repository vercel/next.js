import Link from 'next/link'
import Nav from '../../../components/nav'

export default async function LinkPage({ searchParams }) {
  const queryId = (await searchParams).id || '0'
  const id = parseInt(queryId)
  return (
    <>
      <h3 id="query">query:{id}</h3>
      <div>
        <Link href={`/next-api/link?id=${id + 1}`} id="next_id">
          next id
        </Link>
      </div>
      <Nav />
    </>
  )
}
