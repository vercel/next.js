import Link from 'next/link'
import Nav from '../../components/nav'

export default function LinkPage({ router }) {
  const { query } = router
  const id = parseInt(query.id || '0', 10)
  return (
    <>
      <h3 id="query">query:{id}</h3>
      <div>
        <Link href={`/next-api/link?id=${id + 1}`}>
          <a id="next_id">next id</a>
        </Link>
      </div>
      <Nav />
    </>
  )
}

export const config = {
  runtime: 'edge',
}
