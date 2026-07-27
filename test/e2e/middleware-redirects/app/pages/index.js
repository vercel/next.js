import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <p className="title">Home Page</p>
      <Link href="/old-home" id="old-home">
        Redirect me to a new version of a page
      </Link>
      <div />
      <Link href="/old-home?override=external" id="old-home-external">
        Redirect me to an external site
      </Link>
      <div />
      <Link href="/blank-page?foo=bar">Redirect me with URL params intact</Link>
      <div />
      <Link href="/redirect-to-google">
        Redirect me to Google (with no body response)
      </Link>
      <div />
      <Link href="/redirect-to-google">
        Redirect me to Google (with no stream response)
      </Link>
      <div />
      <Link href="/redirect-me-alot">Redirect me alot (chained requests)</Link>
      <div />
      <Link href="/infinite-loop">Redirect me alot (infinite loop)</Link>
      <div />
      <Link
        href="/to?pathname=/api/ok"
        locale="nl"
        id="link-to-api-with-locale"
      >
        Redirect me to api with locale
      </Link>
      <div />
      <Link href="/to?pathname=/old-home" id="link-to-to-old-home">
        Redirect me to a redirecting page of new version of page
      </Link>
      <div />
    </div>
  )
}
