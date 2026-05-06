import Link from 'next/link'

export const unstable_instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>This is a static page</p>
      <Link href="/suspense-in-root/static/missing-suspense-in-parallel-route/foo">
        ./foo
      </Link>
    </main>
  )
}
