import Link from 'next/link'

export default function Page() {
  return (
    <div id="modal-page" style={{ minHeight: 3200 }}>
      <h1>Modal page</h1>
      <input id="focus-target" aria-label="Focus target" />
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
      <Link
        id="open-modal-missing-hash"
        href="/modal/visible#missing-target"
        style={{
          position: 'fixed',
          top: 80,
          right: 20,
          padding: 12,
          background: 'white',
        }}
      >
        Open visible modal with missing hash
      </Link>
      <Link
        id="open-empty-modal-real-hash"
        href="/modal/open#hash-target"
        style={{
          position: 'fixed',
          top: 140,
          right: 20,
          padding: 12,
          background: 'white',
        }}
      >
        Open empty modal with real hash
      </Link>
      <div id="hash-target" style={{ marginTop: 1800 }}>
        Hash target
      </div>
    </div>
  )
}
