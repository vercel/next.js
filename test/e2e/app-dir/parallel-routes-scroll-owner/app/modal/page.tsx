import Link from 'next/link'

export default function Page() {
  return (
    <div id="modal-page" style={{ minHeight: 2400 }}>
      <h1>Modal page</h1>
      <Link
        id="open-empty-modal"
        href="/modal/open"
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          padding: 12,
          background: 'white',
        }}
      >
        Open empty modal
      </Link>
    </div>
  )
}
