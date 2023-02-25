import Link from 'next/link'

export default function Page() {
  return (
    <div id="to-page">
      <Link id="user-navigation-link" href="/to/4">
        to user page
      </Link>
    </div>
  )
}
