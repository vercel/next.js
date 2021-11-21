import Link from 'next/link'
import { useRouter } from 'next/router'

function NoFallbackPage(props) {
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
  if (params.slug === 'second') return { notFound: true }
  return {
    props: {
      slug: params.slug,
      locale,
      defaultLocale,
    },
  }
}

export const getStaticPaths = ({ locales }) => {
  const paths = [
    { params: { slug: 'first' } },
    { params: { slug: 'second' } },
    { params: { slug: 'third' } },
  ]

  if (locales) {
    for (const locale of locales) {
      paths.push({ params: { slug: 'first' }, locale })
    }
  }
  return {
    paths,
    fallback: false,
  }
}

export default NoFallbackPage
