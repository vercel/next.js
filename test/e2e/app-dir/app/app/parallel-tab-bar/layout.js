import Link from 'next/link'

function AudienceNav() {
  return (
    <ul>
      <li>
        <Link href="/parallel-tab-bar">Home</Link>
      </li>
      <li>
        <Link href="/parallel-tab-bar/demographics">Demographics</Link>
      </li>
      <li>
        <Link href="/parallel-tab-bar/subscribers">Subscribers</Link>
      </li>
    </ul>
  )
}

function ViewsNav() {
  return (
    <ul>
      <li>
        <Link href="/parallel-tab-bar">Home</Link>
      </li>
      <li>
        <Link href="/parallel-tab-bar/impressions">Impressions</Link>
      </li>
      <li>
        <Link href="/parallel-tab-bar/view-duration">View Duration</Link>
      </li>
    </ul>
  )
}
export default function Layout({ children, audience, views }) {
  return (
    <>
      <h1>Tab Bar Layout</h1>
      {children}

      <h2>Audience</h2>
      <AudienceNav />
      {audience}

      <h2>Views</h2>
      <ViewsNav />
      {views}
    </>
  )
}
