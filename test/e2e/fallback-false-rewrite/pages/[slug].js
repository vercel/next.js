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
    paths: ['/first', '/second'],
    fallback: false,
  }
}

export default function Page({ world }) {
  const router = useRouter()

  if (router.isFallback) {
    throw new Error('should not have fallback')
  }

  return (
    <>
      <p id="slug">hello {world}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
    </>
  )
}
