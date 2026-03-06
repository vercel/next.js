import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p>Index page inside (inner) route group</p>
      <Link href="/suspense-in-root/static/route-group-shared-boundary/foo">
        ./foo
      </Link>
    </main>
  )
}
