import Link from 'next/link'

export default function Page() {
  return (
    <main style={{ height: 3000 }}>
      <h1 style={{ margin: 0 }}>Home</h1>
      <Link id="to-section" href="/section">
        Section
      </Link>
      <Link id="to-section-no-prefetch" href="/section" prefetch={false}>
        Section without prefetching
      </Link>
      <Link id="to-flat" href="/flat">
        Flat
      </Link>
      <Link id="to-section-no-scroll" href="/section" scroll={false}>
        Section without scrolling
      </Link>
      <Link id="to-section-anchor" href="/section#target">
        Section anchor
      </Link>
    </main>
  )
}
