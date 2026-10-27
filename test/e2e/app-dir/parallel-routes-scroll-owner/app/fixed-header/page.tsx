import Link from 'next/link'

export default function Page() {
  return (
    <main id="fixed-header-home" style={{ minHeight: 4000, paddingTop: 80 }}>
      <Link id="to-fixed-header-about" href="/fixed-header/about">
        Go to about
      </Link>
    </main>
  )
}
