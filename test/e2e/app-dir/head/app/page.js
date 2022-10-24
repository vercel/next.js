import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="page">index page</p>

      <Link href="/blog" id="to-blog">
        to /blog
      </Link>
      <br />

      <Link href="/blog/post-1" id="to-blog-slug">
        to /blog/post-1
      </Link>
      <br />

      <Link href="/blog/about" id="to-blog-about">
        to /blog/about
      </Link>
      <br />
    </>
  )
}
