import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return (
    <>
      <Link href="#only-hash" id="dynamic-route-only-hash">
        Dynamic route only hash
      </Link>
      <br />
      <Link href={{ hash: 'only-hash-obj' }} id="dynamic-route-only-hash-obj">
        Dynamic route only hash object
      </Link>
      <br />
      <Link href="?name=post-2" id="dynamic-route-only-query">
        Dynamic route only query
      </Link>
      <br />
      <Link
        href="?name=post-3&another=value"
        id="dynamic-route-only-query-extra"
      >
        Dynamic route only query extra
      </Link>
      <br />
      <Link
        href={{ query: { name: 'post-4' } }}
        id="dynamic-route-only-query-obj"
      >
        Dynamic route only query object
      </Link>
      <br />
      <Link
        href={{ query: { name: 'post-5', another: 'value' } }}
        id="dynamic-route-only-query-obj-extra"
      >
        Dynamic route only query object extra
      </Link>
      <br />
      <Link href="?name=post-2#hash-too" id="dynamic-route-query-hash">
        Dynamic route query and hash
      </Link>
      <br />
      <Link
        href="?name=post-3&another=value#hash-again"
        id="dynamic-route-query-extra-hash"
      >
        Dynamic route query extra and hash
      </Link>
      <br />
      <Link
        href={{ query: { name: 'post-4' }, hash: 'hash-too' }}
        id="dynamic-route-query-hash-obj"
      >
        Dynamic route query and hash object
      </Link>
      <br />
      <Link
        href={{
          query: { name: 'post-5', another: 'value' },
          hash: 'hash-again',
        }}
        id="dynamic-route-query-obj-extra-hash"
      >
        Dynamic route query and hash object extra
      </Link>
      <br />
      <p id="asdf">This is {query.name}</p>
      <p id="query">{JSON.stringify(query)}</p>
    </>
  )
}

Page.getInitialProps = () => ({})

export default Page
