import Link from 'next/link'

export default function Index() {
  return (
    <>
      <Link href="/blog/another/" id="to-blog-another">
        to /blog/another/
      </Link>
      <br />
      <Link href="/blog/first-post/" id="to-blog-post">
        to /blog/first-post/
      </Link>
      <br />
      <Link href="/catch-all/hello/world/" id="to-catch-all-item">
        to /catch-all/hello/world/
      </Link>
      <br />
      <Link href="/catch-all/first/" id="to-catch-all-first">
        to /catch-all/first/
      </Link>
      <br />
      <Link href="/another/" id="to-another">
        to /another/
      </Link>
      <br />
      <Link href="/top-level-slug/" id="to-slug">
        to /top-level-slug/
      </Link>
      <br />
      <Link as="/world" href="/[slug]" id="to-slug-manual">
        to /world/
      </Link>
      <br />
    </>
  )
}
