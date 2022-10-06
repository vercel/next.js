import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="index">index page</p>
      <Link href="/another">
        <a id="to-another">to another</a>
      </Link>
      <br />
      <Link href="/blog/first">
        <a id="to-blog-first">to /blog/first</a>
      </Link>
      <br />
    </>
  )
}
