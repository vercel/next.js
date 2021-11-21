import Link from 'next/link'
import { useRouter } from 'next/router'

function FallbackBlockingPage(props) {
  const router = useRouter()

  return (
    <>
      <p id="version">new</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">{JSON.stringify(router)}</p>
      <Link href="/">
        <a id="to-index">to /</a>
      </Link>
    </>
  )
}

export const getStaticProps = ({
  params,
  locale = null,
  defaultLocale = null,
}) => {
  // ensure getStaticProps isn't called without params
  if (!params || !params.slug) {
    throw new Error(`missing params ${JSON.stringify(params)}`)
  }

  if (params.slug === 'not-found') {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      slug: params.slug,
      locale,
      defaultLocale,
    },
  }
}

export const getStaticPaths = () => {
  const paths = [
    { params: { slug: 'first' } },
    { params: { slug: 'second' } },
    { params: { slug: 'third' } },
  ]

  return {
    paths,
    fallback: 'blocking',
  }
}

export default FallbackBlockingPage
