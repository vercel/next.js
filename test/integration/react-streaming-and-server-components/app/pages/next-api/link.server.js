import Link from 'next/link'

export default function LinkPage({ router }) {
  const { query } = router
  const id = parseInt(query.id || '0', 10)
  return (
    <>
      <h3 id="query">query:{id}</h3>
      <Link href={`/next-api/link?id=${id + 1}`}>
        <a id="next_id">next id</a>
      </Link>
      <Link href={`/`}>
        <a>go home</a>
      </Link>
    </>
  )
}
