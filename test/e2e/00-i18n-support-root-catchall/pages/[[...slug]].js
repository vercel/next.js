import Link from 'next/link'
import { useRouter } from 'next/router'

const Slug = (props) => {
  const router = useRouter()

  // invariant ensuring fallback is never accidentally flipped
  if (router.isFallback) {
    return 'Loading...'
  }

  return (
    <div>
      <p>catchall page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locales">{JSON.stringify(router.locales)}</p>
      <p id="router-query">{JSON.stringify(router.query)}</p>
      <p id="router-pathname">{router.pathname}</p>
      <p id="router-as-path">{router.asPath}</p>
      <Link href="/gsp/blocking/hallo-wereld" locale={'nl-NL'}>
        <a>/nl-NL/gsp/blocking/hallo-wereld</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/42" locale={'nl-NL'}>
        <a>/nl-NL/gsp/blocking/42</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/hallo-welt" locale={'fr'}>
        <a>/fr/gsp/blocking/hallo-welt</a>
      </Link>
      <br />
      <Link href="/gsp/blocking/42" locale={'fr'}>
        <a>/fr/gsp/blocking/42</a>
      </Link>
      <br />
      <Link href="/">
        <a>/</a>
      </Link>
    </div>
  )
}

export const getStaticProps = ({ params }) => {
  return {
    props: {
      params,
      random: Math.random() + Date.now(),
      catchall: 'yes',
    },
    revalidate: 1,
  }
}

export const getStaticPaths = ({ locales }) => {
  const paths = []

  for (const locale of locales) {
    paths.push({ params: { slug: ['first'] }, locale })
    paths.push({ params: { slug: ['first'] }, locale })
  }

  return {
    paths,
    fallback: 'blocking',
  }
}

export default Slug
