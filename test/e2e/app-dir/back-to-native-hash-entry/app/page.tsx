import Link from 'next/link'

export default function PageA() {
  return (
    <>
      <h1 id="page-heading">Page A</h1>
      <a id="native-hash-link" href="#section">
        Native hash link
      </a>
      <Link id="link-hash-link" href="#section">
        Next.js hash link
      </Link>
      <Link id="link-to-b" href="/b">
        Next.js link to Page B
      </Link>
      <div style={{ height: '200vh' }} />
      <h2 id="section">Section</h2>
      <div style={{ height: '200vh' }} />
    </>
  )
}
