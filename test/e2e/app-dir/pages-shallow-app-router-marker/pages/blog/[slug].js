import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

export function getServerSideProps({ params }) {
  return { props: { slug: params.slug } }
}

export default function Page({ slug }) {
  const router = useRouter()
  const [count, setCount] = useState(0)
  const [prefetchState, setPrefetchState] = useState('idle')

  return (
    <>
      <p id="pages-page">hello from pages/blog/[slug]</p>
      {/* server-provided prop: it must survive a shallow navigation */}
      <p id="slug">{slug}</p>
      {/* read from the router so the value does not depend on a data fetch */}
      <p id="tab">{router.query.tab || 'a'}</p>
      {/* client state: a hard navigation resets it */}
      <button id="counter" onClick={() => setCount((c) => c + 1)}>
        {count}
      </button>
      <p id="prefetch-state">{prefetchState}</p>
      <button
        id="prefetch-new"
        onClick={async () => {
          // "route as modal": `href` is the current dynamic route pattern with
          // another slug, `as` is the app route `app/blog/new/page.js`. The
          // client router filter matches `as`, and the prefetch stores its
          // marker under the `href` pathname, the route of this page.
          await router.prefetch('/blog/[slug]?slug=new', '/blog/new')
          setPrefetchState('done')
        }}
      >
        prefetch /blog/new
      </button>
      <Link id="tab-b" href={`/blog/${slug}?tab=b`} shallow>
        tab b
      </Link>
    </>
  )
}
