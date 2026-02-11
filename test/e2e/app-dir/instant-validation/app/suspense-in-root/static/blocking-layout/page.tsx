import Link from 'next/link'

export const unstable_instant = { prefetch: 'static' }

export default async function Page() {
  return (
    <main>
      <p>This is a static page below a blocking layout</p>
      <div>
        <Link href="/suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic">
          /suspense-in-root/static/blocking-layout/missing-suspense-around-dynamic
        </Link>
      </div>
    </main>
  )
}
