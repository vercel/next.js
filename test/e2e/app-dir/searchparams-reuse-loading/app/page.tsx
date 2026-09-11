import Link from 'next/link'
import { LinkAccordion } from './link-accordion'

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
          <LinkAccordion href="/search-params?id=3" />
        </li>
        <li>
          <Link href="/search-params" prefetch={true}>
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
