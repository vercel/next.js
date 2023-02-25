import Link from 'next/link'

export default function Page() {
  return (
    <div id="from-page">
      <Link id="to-navigation-link" href="/to">
        to page
      </Link>
    </div>
  )
}
