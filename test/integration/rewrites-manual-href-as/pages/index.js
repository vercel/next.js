import { useRouter } from 'next/router'
import Link from 'next/link'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="index">index page</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>

      {router.query.imageId ? <p id="modal">show modal</p> : null}

      <Link href="/?imageId=123" as="/preview/123">
        <a id="to-modal">open modal for /preview/123</a>
      </Link>
      <br />

      <Link href="/preview/123">
        <a id="to-preview">go to /preview/123</a>
      </Link>
      <br />

      <Link href="/another">
        <a id="to-another">go to /another</a>
      </Link>
      <br />

      <Link href="/rewrite-me">
        <a id="to-rewrite-me">go to /rewrite-me</a>
      </Link>
      <br />

      <Link href="/" as="/rewrite-me">
        <a id="to-index-as-rewrite">go to / as /rewrite-me</a>
      </Link>
      <br />
    </>
  )
}
