import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="catch-alll">catch-all page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-default-locale">{router.defaultLocale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>

      <Link href="/" locale="en-US" id="to-def-locale-index">
        to /
      </Link>
      <br />

      <Link href="/another" locale="en-US" id="to-def-locale-another">
        to /another
      </Link>
      <br />

      <Link href="/" locale="nl-NL" id="to-locale-index">
        to /nl-nl
      </Link>
      <br />

      <Link href="/another" locale="nl-NL" id="to-locale-another">
        to /nl-nl/another
      </Link>
      <br />

      <Link href="/fr" locale={false} id="to-fr-locale-index">
        to /fr
      </Link>
      <br />

      <Link href="/fr/another" locale={false} id="to-fr-locale-another">
        to /fr/another
      </Link>
      <br />
    </>
  )
}

export const getStaticProps = ({ locale, locales, defaultLocale, params }) => {
  return {
    props: {
      params: params || null,
      locale,
      locales,
      defaultLocale,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [
      {
        params: { slug: [] },
        locale: 'en-US',
      },
      {
        params: { slug: undefined },
        locale: 'fr',
      },
    ],
    fallback: 'blocking',
  }
}
