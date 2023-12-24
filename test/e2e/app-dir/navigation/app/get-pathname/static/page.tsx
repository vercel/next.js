import Link from 'next/link'
import { getPathname } from 'next/navigation'

export default function StaticPage() {
  const pathname = getPathname()

  return (
    <>
      <p id="static-page">Static</p>
      <p>
        Pathname - <span id="pathname">{pathname}</span>
      </p>
      <p>
        <Link href="/get-pathname" id="home">
          Home
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/static" id="static">
          Static
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/static/slug" id="static-slug">
          Static Slug
        </Link>
      </p>
      <p>
        <Link href="/get-pathname/static/client" id="static-client">
          Static Client
        </Link>
      </p>
      <p>
        <Link
          href="/get-pathname/static/rewrite-source"
          id="static-rewrite-source"
        >
          Static Rewrite Source
        </Link>
      </p>
    </>
  )
}
