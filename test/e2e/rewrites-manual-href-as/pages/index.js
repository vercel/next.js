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

      <Link href="/?imageId=123" as="/preview/123" id="to-modal">
        open modal for /preview/123
      </Link>
      <br />

      <Link href="/preview/123" id="to-preview">
        go to /preview/123
      </Link>
      <br />

      <Link href="/another" id="to-another">
        go to /another
      </Link>
      <br />

      <Link href="/rewrite-me" id="to-rewrite-me">
        go to /rewrite-me
      </Link>
      <br />

      <Link href="/" as="/rewrite-me" id="to-index-as-rewrite">
        go to / as /rewrite-me
      </Link>
      <br />
    </>
  )
}
