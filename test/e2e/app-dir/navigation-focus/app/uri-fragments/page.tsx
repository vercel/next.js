import Link from 'next/link'

export default function UriFragmentsPage() {
  return (
    <>
      <nav aria-label="table of contents">
        <ol>
          <li>
            <Link href="#section-1">Section 1</Link>
          </li>
          <li>
            <Link href="#section-2">Section 2</Link>
          </li>
          <li>
            <Link href="#section-3">Section 3</Link>
          </li>
        </ol>
      </nav>

      <article style={{ height: '50vh', overflow: 'scroll' }}>
        <h1>A post</h1>

        <p style={{ height: '100vh' }}>some long intro</p>

        <h2 id="section-1">Section 1</h2>
        <p style={{ height: '100vh' }}>bla</p>

        <h2 id="section-2">Section 2</h2>
        <p style={{ height: '100vh' }}>bla</p>

        <h2 id="section-3">Section 3</h2>
        <p style={{ height: '100vh' }}>bla</p>

        <h2 id="section-4">Section 4</h2>
        <p style={{ height: '100vh' }}>bla</p>
      </article>
    </>
  )
}
