import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link
        href="/navigation/refresh/navigate-then-refresh-bug/page-to-refresh"
        id="to-route"
      >
        To route
      </Link>
    </>
  )
}
