import Link from 'next/link'
import { useRouter } from 'next/router'

export async function getServerSideProps({ params }) {
  return {
    props: {
      slug: params.slug,
    },
  }
}

export default function Page({ slug }) {
  const router = useRouter()
  return (
    <>
      <h1 id="page-title">Pages Blog: {slug}</h1>
      <p id="tab">{router.query.tab || 'a'}</p>
      <Link id="tab-b-link" href={`/blog/${slug}?tab=b`} shallow>
        Tab B
      </Link>
      <Link
        id="to-second-link"
        href={{ pathname: '/blog/[slug]', query: { slug: 'second' } }}
      >
        To Second
      </Link>
      {/*
        "Route as modal": `href` is the current dynamic route pattern with an
        extra query param and `as` shows a different URL, here an App Router
        route.
      */}
      <Link
        id="to-dashboard-link"
        href={{
          pathname: router.pathname,
          query: { ...router.query, modal: 1 },
        }}
        as="/dashboard"
        shallow
      >
        To Dashboard
      </Link>
    </>
  )
}
