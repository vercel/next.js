import Link from 'next/link'

export function getServerSideProps() {
  return { props: { title: 'hello from pages/modal' } }
}

// Served at `/modal` and, through the config rewrite, at `/pretty`.
export default function Page({ title }) {
  return (
    <>
      {/* server-provided prop: it is lost when a marker is rendered */}
      <p id="modal-page">{title}</p>
      {/*
        When this page is loaded at `/pretty`, prefetching the canonical URL
        evaluates the client router filter against `/modal`, the route of the
        current page, and stores the marker under it.
      */}
      <Link id="canonical-link" href="/modal">
        canonical
      </Link>
      <Link id="hash-link" href="#section">
        to section
      </Link>
      <p id="section">section</p>
    </>
  )
}
