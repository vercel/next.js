import Link from 'next/link'
import { useRouter } from 'next/router'

export function getServerSideProps({ params, query }) {
  return { props: { slug: params.slug, tab: query.tab || 'a' } }
}

export default function Page({ slug, tab }) {
  const router = useRouter()
  return (
    <>
      <p id="pages-page">hello from pages/blog/[slug]</p>
      <p id="tab">{tab}</p>
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
