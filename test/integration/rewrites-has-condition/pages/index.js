import Link from 'next/link'

export default function Page(props) {
  return (
    <>
      <p id="index">index page</p>
      <Link href="/rewrite-simple">
        <a id="to-simple">to /rewrite-simple</a>
      </Link>
      <br />

      <Link href="/rewrite-with-has?hasQuery=true">
        <a id="to-has-rewrite">to /rewrite-with-has?hasQuery=true</a>
      </Link>
      <br />
    </>
  )
}
