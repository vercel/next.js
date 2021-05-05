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
      <p id="asdf">This is {query.name}</p>
      <p id="query">{JSON.stringify(query)}</p>
    </>
  )
}

Page.getInitialProps = () => ({})

export default Page
