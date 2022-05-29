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
      <p id="page">another page</p>
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

      <Link href="/dynamic/first">
        <a id="to-dynamic">to /dynamic/first</a>
      </Link>
      <br />
    </>
  )
}

export function getServerSideProps() {
  return {
    props: {
      hello: 'world',
      now: Date.now(),
    },
  }
}
