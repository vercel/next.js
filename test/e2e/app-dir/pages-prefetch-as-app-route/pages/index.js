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
      {/*
        `/modal` is a pages route and also the static prefix of the app route
        `app/modal/[id]`, so the dynamic client router filter flags it.
      */}
      <Link id="modal-link" href="/modal">
        to modal
      </Link>
      <button
        id="push-pretty"
        onClick={() => {
          // href is the flagged pages route, `as` is an unrelated pretty URL
          router.push('/modal', '/pretty')
        }}
      >
        push /modal as /pretty
      </button>
      <button
        id="push-pretty-rewrite"
        onClick={() => {
          // `/pretty` is rewritten to the flagged pages route `/modal` by a
          // config rewrite. A button instead of a link so that no hover
          // prefetch of `/pretty` itself writes a marker.
          router.push('/pretty')
        }}
      >
        push /pretty
      </button>
    </>
  )
}
