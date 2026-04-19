import { useRouter } from 'next/router'

export const getStaticProps = () => {
  return {
    props: {
      world: 'world',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Page({ world }) {
  const router = useRouter()

  if (typeof window !== 'undefined' && !window.setInitialSlug) {
    window.setInitialSlug = true
    window.initialSlug = router.query.slug
  }

  if (router.isFallback) return 'Loading...'

  return (
    <>
      <p>hello {world}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}
