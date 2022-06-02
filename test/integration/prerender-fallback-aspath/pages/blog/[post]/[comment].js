import { useRouter } from 'next/router'

export default function Comment({ params }) {
  const router = useRouter()

  if (router.isFallback) return 'Loading...'

  return (
    <>
      <p id="as-path">{router.asPath}</p>
      <p id="query">{JSON.stringify(router.query)}</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}

export const getStaticProps = ({ params }) => {
  return {
    props: {
      params,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}
