import Link from 'next/link'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  return (
    <main>
      <p>This is a static page</p>
      <Link href="./missing-suspense-in-parallel-route/foo">./foo</Link>
    </main>
  )
}
