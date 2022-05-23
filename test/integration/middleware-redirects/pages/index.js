import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p className="title">Home Page</p>
      <Link href="/old-home">
        <a>Redirect me to a new version of a page</a>
      </Link>
      <div />
      <Link href="/blank-page?foo=bar">
        <a>Redirect me with URL params intact</a>
      </Link>
      <div />
      <Link href="/redirect-to-google">
        <a>Redirect me to Google (with no body response)</a>
      </Link>
      <div />
      <Link href="/redirect-to-google">
        <a>Redirect me to Google (with no stream response)</a>
      </Link>
      <div />
      <Link href="/redirect-me-alot">
        <a>Redirect me alot (chained requests)</a>
      </Link>
      <div />
      <Link href="/infinite-loop">
        <a>Redirect me alot (infinite loop)</a>
      </Link>
      <div />
      <Link href="/to?pathname=/api/ok" locale="nl">
        <a id="link-to-api-with-locale">Redirect me to api with locale</a>
      </Link>
      <div />
    </div>
  )
}
