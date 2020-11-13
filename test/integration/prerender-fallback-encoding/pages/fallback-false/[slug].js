import paths from '../../paths'
import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">{JSON.stringify(router)}</p>
    </>
  )
}

export const getStaticProps = ({ params }) => {
  return {
    props: {
      random: Math.random(),
      params,
    },
  }
}

export const getStaticPaths = () => {
  return {
    paths,
    fallback: false,
  }
}
