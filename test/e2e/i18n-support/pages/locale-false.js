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
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href={`/${nextLocale}/another`} locale={false} id="to-another">
        to /another
      </Link>
      <br />
      <Link href={`/${nextLocale}/gsp`} locale={false} id="to-gsp">
        to /gsp
      </Link>
      <br />
      <Link
        href={`/${nextLocale}/gsp/fallback/first`}
        locale={false}
        id="to-fallback-first"
      >
        to /gsp/fallback/first
      </Link>
      <br />
      <Link
        href={`/${nextLocale}/gsp/fallback/hello`}
        locale={false}
        id="to-fallback-hello"
      >
        to /gsp/fallback/hello
      </Link>
      <br />
      <Link
        href={`/${nextLocale}/gsp/no-fallback/first`}
        locale={false}
        id="to-no-fallback-first"
      >
        to /gsp/no-fallback/first
      </Link>
      <br />
      <Link href={`/${nextLocale}/gssp`} locale={false} id="to-gssp">
        to /gssp
      </Link>
      <br />
      <Link href={`/${nextLocale}/gssp/first`} locale={false} id="to-gssp-slug">
        to /gssp/first
      </Link>
      <br />
      <Link href={`/gssp/first`} locale={false} id="to-gssp-slug-default">
        to /gssp/first (default locale)
      </Link>
      <br />
      <Link href={`/gsp`} locale={false} id="to-gsp-default">
        to /gsp (default locale)
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
