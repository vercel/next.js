import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="gsp">gsp page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/" id="to-index">
        to /
      </Link>
      <br />
    </>
  )
}

export const getStaticProps = ({ params, locale, locales }) => {
  // ensure getStaticProps isn't called without params
  if (!params || !params.slug) {
    throw new Error(`missing params ${JSON.stringify(params)}`)
  }

  if (locale === 'en' || locale === 'nl') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      params,
      locale,
      locales,
    },
  }
}

export const getStaticPaths = () => {
  return {
    // the default locale will be used since one isn't defined here
    paths: ['first', 'second'].map((slug) => ({
      params: { slug },
    })),
    fallback: 'blocking',
  }
}
