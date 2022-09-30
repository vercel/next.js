import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

export default function Page(props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <>
      <p id="page">dynamic page</p>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router">
        {JSON.stringify(
          mounted
            ? {
                basePath: router.basePath,
                pathname: router.pathname,
                asPath: router.asPath,
                query: router.query,
              }
            : {}
        )}
      </p>

      <Link href="/">
        <a id="to-index">to /index</a>
      </Link>
      <br />

      <Link href="/dynamic/second">
        <a id="to-dynamic">to /dynamic/second</a>
      </Link>
      <br />
    </>
  )
}

export function getStaticPaths() {
  return {
    paths: ['/dynamic/first'],
    fallback: true,
  }
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
      hello: 'world',
      now: Date.now(),
    },
  }
}
