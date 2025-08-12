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

export const getStaticProps = ({ params, locale, locales }) => {
  return {
    props: {
      random: Math.random() + Date.now(),
      params,
      locale,
      locales,
    },
    revalidate: 1,
  }
}

export const getStaticPaths = ({ locales }) => {
  const paths = []

  for (const locale of locales) {
    paths.push({ params: { slug: 'first' }, locale })
    paths.push({ params: { slug: 'second' }, locale })
  }

  return {
    // the default locale will be used since one isn't defined here
    paths,
    fallback: true,
  }
}
