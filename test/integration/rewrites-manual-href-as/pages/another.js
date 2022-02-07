import { useRouter } from 'next/router'
import Link from 'next/link'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="another">another page</p>
      <p id="pathname">{router.pathname}</p>
      <p id="query">{JSON.stringify(router.query)}</p>

      <Link href="/?imageId=123" as="/preview/123">
        <a id="to-modal">open modal for /preview/123</a>
      </Link>
      <br />

      <Link href="/preview/123">
        <a id="to-preview">go to /preview/123</a>
      </Link>
      <br />
    </>
  )
}
