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
        href stays on the current pages route, `as` is an app route.
        Hovering it prefetches `href`/`as` and runs the client router filter
        against `as`.
      */}
      <Link id="app-link" href="/?modal=1" as="/dashboard" shallow>
        to app route
      </Link>
    </>
  )
}
