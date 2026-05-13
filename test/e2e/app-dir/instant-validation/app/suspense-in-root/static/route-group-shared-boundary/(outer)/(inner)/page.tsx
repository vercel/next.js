import Link from 'next/link'

// The instant config is on the page. When (outer) is shared and
// (inner) is the boundary, this page is in the new tree where
// buildNewTreeSeedData finds the config and triggers validation.
export const unstable_instant = { level: 'experimental-error' }

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
