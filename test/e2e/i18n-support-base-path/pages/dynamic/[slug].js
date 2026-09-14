import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="dynamic">dynamic page</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-default-locale">{router.defaultLocale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/another" id="to-another">
        to /another
      </Link>
      <br />
      <Link href="/gsp" id="to-gsp">
        to /gsp
      </Link>
      <br />
      <Link href="/gsp/fallback/first" id="to-fallback-first">
        to /gsp/fallback/first
      </Link>
      <br />
      <Link href="/gsp/fallback/hello" id="to-fallback-hello">
        to /gsp/fallback/hello
      </Link>
      <br />
      <Link href="/gsp/no-fallback/first" id="to-no-fallback-first">
        to /gsp/no-fallback/first
      </Link>
      <br />
      <Link href="/gssp" id="to-gssp">
        to /gssp
      </Link>
      <br />
      <Link href="/gssp/first" id="to-gssp-slug">
        to /gssp/first
      </Link>
      <br />
    </>
  )
}
