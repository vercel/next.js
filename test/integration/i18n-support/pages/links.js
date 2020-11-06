import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()
  const { nextLocale } = router.query

  return (
    <>
      <p id="links">links page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-default-locale">{router.defaultLocale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/another" locale={nextLocale}>
        <a id="to-another">to /another</a>
      </Link>
      <br />
      <Link href="/gsp" locale={nextLocale}>
        <a id="to-gsp">to /gsp</a>
      </Link>
      <br />
      <Link href="/gsp/fallback/first" locale={nextLocale}>
        <a id="to-fallback-first">to /gsp/fallback/first</a>
      </Link>
      <br />
      <Link href="/gsp/fallback/hello" locale={nextLocale}>
        <a id="to-fallback-hello">to /gsp/fallback/hello</a>
      </Link>
      <br />
      <Link href="/gsp/no-fallback/first" locale={nextLocale}>
        <a id="to-no-fallback-first">to /gsp/no-fallback/first</a>
      </Link>
      <br />
      <Link href="/gssp" locale={nextLocale}>
        <a id="to-gssp">to /gssp</a>
      </Link>
      <br />
      <Link href="/gssp/first" locale={nextLocale}>
        <a id="to-gssp-slug">to /gssp/first</a>
      </Link>
      <br />
    </>
  )
}

// make SSR page so we have query values immediately
export const getServerSideProps = () => {
  return {
    props: {},
  }
}
