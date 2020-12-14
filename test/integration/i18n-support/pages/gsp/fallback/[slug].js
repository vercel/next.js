import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) return 'Loading...'

  return (
    <>
      <p id="gsp">gsp page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-default-locale">{router.defaultLocale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
      <br />
    </>
  )
}

export const getStaticProps = ({ params, locale, locales, defaultLocale }) => {
  // ensure getStaticProps isn't called without params
  if (!params || !params.slug) {
    throw new Error(`missing params ${JSON.stringify(params)}`)
  }

  if (params && params.slug === 'mixed-not-found-redirect') {
    return {
      notFound: true,
      redirect: {
        destination: '/another',
        permanent: false,
      },
    }
  }

  return {
    props: {
      params,
      locale,
      locales,
      defaultLocale,
    },
  }
}

export const getStaticPaths = ({ locales, defaultLocale }) => {
  // make sure locales were provided correctly
  if (!locales || locales.length !== 7) {
    throw new Error(
      'locales missing in getStaticPaths!! got: ' + JSON.stringify(locales)
    )
  }

  if (!defaultLocale) {
    throw new Error('missing defaultLocale in getStaticPaths')
  }

  const paths = [
    // the default locale will be used since one isn't defined here
    { params: { slug: 'first' } },
    { params: { slug: 'second' } },
  ]

  for (const locale of locales) {
    paths.push({ params: { slug: 'always' }, locale })
  }

  return {
    paths,
    fallback: true,
  }
}
