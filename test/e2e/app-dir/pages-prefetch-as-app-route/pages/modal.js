import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'

export function getServerSideProps() {
  return { props: { title: 'hello from pages/modal' } }
}

// Served at `/modal` and, through the config rewrite, at `/pretty`.
export default function Page({ title }) {
  const router = useRouter()
  const [prefetchState, setPrefetchState] = useState('idle')

  return (
    <>
      {/* server-provided prop: it is lost when a marker is rendered */}
      <p id="modal-page">{title}</p>
      {/*
        When this page is loaded at `/pretty`, prefetching the canonical URL
        evaluates the client router filter against `/modal`, the route of the
        current page. The button reports when the prefetch has finished.
      */}
      <button
        id="prefetch-canonical"
        onClick={async () => {
          await router.prefetch('/modal')
          setPrefetchState('done')
        }}
      >
        prefetch canonical
      </button>
      <p id="prefetch-state">{prefetchState}</p>
      <Link id="hash-link" href="#section">
        to section
      </Link>
      <p id="section">section</p>
    </>
  )
}
