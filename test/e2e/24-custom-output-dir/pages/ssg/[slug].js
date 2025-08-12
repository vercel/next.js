import { useRouter } from 'next/router'

export const getStaticProps = ({ params }) => {
  return {
    props: {
      params,
      hello: 'world',
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths: [{ params: { slug: 'first' } }],
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
      <p>slug: {props.params?.slug}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
