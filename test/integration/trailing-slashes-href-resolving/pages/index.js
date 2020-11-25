import Link from 'next/link'

export default function Index() {
  return (
    <>
      <Link href="/blog/another/">
        <a id="to-blog-another">to /blog/another/</a>
      </Link>
      <br />
      <Link href="/blog/first-post/">
        <a id="to-blog-post">to /blog/first-post/</a>
      </Link>
      <br />
      <Link href="/catch-all/hello/world/">
        <a id="to-catch-all-item">to /catch-all/hello/world/</a>
      </Link>
      <br />
      <Link href="/catch-all/first/">
        <a id="to-catch-all-first">to /catch-all/first/</a>
      </Link>
      <br />
      <Link href="/another/">
        <a id="to-another">to /another/</a>
      </Link>
      <br />
      <Link href="/top-level-slug/">
        <a id="to-slug">to /top-level-slug/</a>
      </Link>
      <br />
    </>
  )
}
