import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div style={{ height: '100vh' }} />
      <Link href="/" id="top-link">
        top
      </Link>
      <Link href="#section" id="section-link">
        section link
      </Link>
      <section id="section">section content</section>
    </div>
  )
}
