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
      <p id="page">index page</p>
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

      <Link href="/another" id="to-another">
        to /another
      </Link>
      <br />

      <Link href="/another/" id="to-another-slash">
        to /another
      </Link>
      <br />

      <Link href="/dynamic/first" id="to-dynamic">
        to /dynamic/first
      </Link>
      <br />
    </>
  )
}
