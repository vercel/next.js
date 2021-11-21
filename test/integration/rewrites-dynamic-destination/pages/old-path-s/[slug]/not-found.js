import Link from 'next/link'
import { useRouter } from 'next/router'

function NoFallbackPage(props) {
  const router = useRouter()

  return (
    <>
      <p id="version">old</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">{JSON.stringify(router)}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
    </>
  )
}

export const getStaticProps = () => {
  return {
    notFound: true,
  }
}

export const getStaticPaths = () => {
  const paths = [
    { params: { slug: 'first' } },
    { params: { slug: 'second' } },
    { params: { slug: 'third' } },
    { params: { slug: 'fourth' } },
  ]

  return {
    paths,
    fallback: false,
  }
}

export default NoFallbackPage
