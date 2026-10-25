import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <p id="pages-page">hello from pages/index</p>
      <p id="tab">{router.query.tab || 'a'}</p>
      <Link id="tab-b" href="/?tab=b" shallow>
        tab b
      </Link>
      {/*
        The app route `/docs` starts with the `basePath` `/docs`, so it is
        served at `/docs/docs`. `next/link` hands the router the path without
        the `basePath`, so stripping it again would turn `/docs` into `/`.
      */}
      <Link id="app-link" href="/docs">
        to app route
      </Link>
    </>
  )
}
