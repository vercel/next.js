import Link from 'next/link'

// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return (
    <>
      <p>app/loading/page1</p>
      <Link href="/app/loading/page2">Page2</Link>
    </>
  )
}
