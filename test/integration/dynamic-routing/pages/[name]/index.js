import Link from 'next/link'
import { useRouter } from 'next/router'

const Page = () => {
  const router = useRouter()
  const { query } = router
  return (
    <>
      <Link href="#only-hash">
        <a id="dynamic-route-only-hash">Dynamic route only hash</a>
      </Link>
      <br />
      <Link href={{ hash: 'only-hash-obj' }}>
        <a id="dynamic-route-only-hash-obj">Dynamic route only hash object</a>
      </Link>
      <br />
      <Link href="?name=post-2">
        <a id="dynamic-route-only-query">Dynamic route only query</a>
      </Link>
      <br />
      <Link href="?name=post-3&another=value">
        <a id="dynamic-route-only-query-extra">
          Dynamic route only query extra
        </a>
      </Link>
      <br />
      <Link href={{ query: { name: 'post-4' } }}>
        <a id="dynamic-route-only-query-obj">Dynamic route only query object</a>
      </Link>
      <br />
      <Link href={{ query: { name: 'post-5', another: 'value' } }}>
        <a id="dynamic-route-only-query-obj-extra">
          Dynamic route only query object extra
        </a>
      </Link>
      <br />
      <Link href="?name=post-2#hash-too">
        <a id="dynamic-route-query-hash">Dynamic route query and hash</a>
      </Link>
      <br />
      <Link href="?name=post-3&another=value#hash-again">
        <a id="dynamic-route-query-extra-hash">
          Dynamic route query extra and hash
        </a>
      </Link>
      <br />
      <Link href={{ query: { name: 'post-4' }, hash: 'hash-too' }}>
        <a id="dynamic-route-query-hash-obj">
          Dynamic route query and hash object
        </a>
      </Link>
      <br />
      <Link
        href={{
          query: { name: 'post-5', another: 'value' },
          hash: 'hash-again',
        }}
      >
        <a id="dynamic-route-query-obj-extra-hash">
          Dynamic route query and hash object extra
        </a>
      </Link>
      <br />
      <p id="asdf">This is {query.name}</p>
      <p id="query">{JSON.stringify(query)}</p>
    </>
  )
}

Page.getInitialProps = () => ({})

export default Page
