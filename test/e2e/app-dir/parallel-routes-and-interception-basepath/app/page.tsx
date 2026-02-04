import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div id="home-page">Home page</div>
      <br />
      <Link id="link-to-nested" href="/nested">
        To Nested
      </Link>
    </div>
  )
}
