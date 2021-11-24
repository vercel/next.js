import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p className="title">Home Page</p>
      <Link href="/redirects/old-home">
        <a>Redirect me to a new version of a page</a>
      </Link>
      <div />
      <Link href="/redirects/blank-page?foo=bar">
        <a>Redirect me with URL params intact</a>
      </Link>
      <div />
      <Link href="/redirects/redirect-to-google">
        <a>Redirect me to Google (with no body response)</a>
      </Link>
      <div />
      <Link href="/redirects/redirect-to-google">
        <a>Redirect me to Google (with no stream response)</a>
      </Link>
      <div />
      <Link href="/redirects/redirect-me-alot">
        <a>Redirect me alot (chained requests)</a>
      </Link>
      <div />
      <Link href="/redirects/infinite-loop">
        <a>Redirect me alot (infinite loop)</a>
      </Link>
      <div />
    </div>
  )
}
