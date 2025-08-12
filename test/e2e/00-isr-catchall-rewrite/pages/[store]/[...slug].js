import { useRouter } from 'next/router'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      params: params || null,
      random: Math.random() + Date.now(),
    },
    revalidate: 1,
  }
}

export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p>{`store: ${props.params.store}`}</p>
      <p>{`slug: ${props.params.slug?.join('/')}`}</p>
      <p>{`random: ${props.random}`}</p>
      <p>{`pathname: ${router.pathname}`}</p>
      <p>{`asPath: ${router.asPath}`}</p>
    </>
  )
}
