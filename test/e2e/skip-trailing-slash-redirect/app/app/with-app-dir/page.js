import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="index">index page</p>
      <Link href="/with-app-dir/another" id="to-another">
        to another
      </Link>
      <br />
      <Link href="/with-app-dir/another/" id="to-another-with-slash">
        to another
      </Link>
      <br />
      <Link href="/with-app-dir/blog/first" id="to-blog-first">
        to /blog/first
      </Link>
      <br />
    </>
  )
}
