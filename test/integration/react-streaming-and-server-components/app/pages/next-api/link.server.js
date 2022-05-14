import Link from 'next/link'
import Nav from '../../components/nav'

export default function LinkPage({ queryId }) {
  const id = parseInt(queryId)
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

export function getServerSideProps({ query }) {
  return {
    props: {
      queryId: query.id || '0',
    },
  }
}
