import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Page() {
  const router = useRouter()
  return (
    <>
      <h1 id="page-title">Pages Home</h1>
      <p id="tab">{router.query.tab || 'a'}</p>
      <Link id="tab-b-link" href="/?tab=b" shallow>
        Tab B
      </Link>
      {/*
        "Route as modal": `href` stays on the current pages route and `as`
        shows a different URL, here an App Router route.
      */}
      <Link id="to-dashboard-link" href="/?modal=1" as="/dashboard" shallow>
        To Dashboard
      </Link>
    </>
  )
}
