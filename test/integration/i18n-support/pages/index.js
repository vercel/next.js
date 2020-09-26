import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="index">index page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locale">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <Link href="/another">
        <a id="to-another">to /another</a>
      </Link>
      <br />
      <Link href="/gsp/fallback/first">
        <a id="to-fallback-first">to /gsp/fallback/first</a>
      </Link>
      <br />
      <Link href="/gsp/fallback/hello">
        <a id="to-fallback-hello">to /gsp/fallback/hello</a>
      </Link>
      <br />
      <Link href="/gsp/no-fallback/first">
        <a id="to-no-fallback-first">to /gsp/no-fallback/first</a>
      </Link>
      <br />
      <Link href="/gssp">
        <a id="to-gssp">to /gssp</a>
      </Link>
      <br />
      <Link href="/gssp/first">
        <a id="to-gssp-slug">to /gssp/first</a>
      </Link>
      <br />
    </>
  )
}

export const getServerSideProps = ({ locale, locales }) => {
  return {
    props: {
      locale,
      locales,
    },
  }
}
