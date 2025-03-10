import Link from 'next/link'

export default async function Page(props) {
  const searchParams = await props.searchParams
  return (
    <>
      <div id="root-params">{JSON.stringify(searchParams)}</div>
      <Link href="/search">Go to search</Link>
      <hr />

      <ul>
        <li>
          <Link href="/search-params?id=1">/search-params?id=1</Link>
        </li>
        <li>
          <Link href="/search-params?id=2">/search-params?id=2</Link>
        </li>
        <li>
          <Link href="/search-params?id=3" prefetch>
            /search-params?id=3 (prefetch: true)
          </Link>
        </li>
        <li>
          <Link href="/search-params" prefetch>
            /search-params (prefetch: true)
          </Link>
        </li>
        <li>
          <Link href="/params-first" prefetch={false}>
            /params-first
          </Link>
        </li>
        <li>
          <Link href="/root-page-first" prefetch={false}>
            /root-page-first
          </Link>
        </li>
      </ul>
    </>
  )
}
