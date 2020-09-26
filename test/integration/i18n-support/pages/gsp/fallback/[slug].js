import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) return 'Loading...'

  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locale">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
    </>
  )
}

export const getStaticProps = ({ params, locale, locales }) => {
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
    paths: ['first', 'second'].map((slug) => ({
      params: { slug },
    })),
    fallback: true,
  }
}
