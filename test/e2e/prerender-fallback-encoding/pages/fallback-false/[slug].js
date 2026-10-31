import { useRouter } from 'next/router'
import getPaths from '../../paths'

export default function Page(props) {
  const router = useRouter()

  if (router.isFallback) {
    return 'Loading...'
  }

  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">
        {JSON.stringify({
          query: router.query,
          asPath: router.asPath,
          pathname: router.pathname,
        })}
      </p>
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
    paths: getPaths('/fallback-false'),
    fallback: false,
  }
}
