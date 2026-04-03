import Link from 'next/link'

export default function PageA() {
  return (
    <div>
      <h1 id="page-a-title">Page A</h1>
      {/* Tall content to enable scrolling */}
      <div
        style={{
          height: '2000px',
          background: 'linear-gradient(#e0e0e0, #a0a0a0)',
        }}
      >
        <p>Tall content to enable scrolling</p>
      </div>
      <Link href="/page-b" id="link-to-b">
        Go to Page B
      </Link>
    </div>
  )
}
