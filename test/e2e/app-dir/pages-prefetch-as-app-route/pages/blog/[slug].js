import Link from 'next/link'
import { useRouter } from 'next/router'

export function getServerSideProps({ params }) {
  return { props: { slug: params.slug } }
}

export default function Page({ slug }) {
  const router = useRouter()
  return (
    <>
      <p id="pages-page">hello from pages/blog/[slug]</p>
      {/* read from the router: a shallow navigation does not re-run getServerSideProps */}
      <p id="tab">{router.query.tab || 'a'}</p>
      <Link id="tab-b" href={`/blog/${slug}?tab=b`} shallow>
        tab b
      </Link>
      {/*
        "route as modal": href is the current dynamic route pattern with an
        extra query param, `as` is an app route.
      */}
      <Link
        id="app-link"
        href={{
          pathname: router.pathname,
          query: { ...router.query, modal: 1 },
        }}
        as="/dashboard"
        shallow
      >
        to app route
      </Link>
    </>
  )
}
