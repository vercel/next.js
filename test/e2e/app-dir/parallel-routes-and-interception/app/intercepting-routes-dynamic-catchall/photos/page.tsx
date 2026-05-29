import Link from 'next/link'

export default function Home() {
  return (
    <>
      <Link href="/intercepting-routes-dynamic-catchall/photos/catchall/123">
        Visit Catch-all
      </Link>

      <Link href="/intercepting-routes-dynamic-catchall/photos/optional-catchall/123">
        Visit Optional Catch-all
      </Link>
    </>
  )
}
