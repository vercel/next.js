import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div style={{ height: '100vh' }} />
      <Link href="/">
        <a id="top-link">top</a>
      </Link>
      <Link href="#section">
        <a id="section-link">section link</a>
      </Link>
      <section id="section">section content</section>
    </div>
  )
}
