import Link from 'next/link'

// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return (
    <>
      <p>app/loading/page2</p>
      <Link href="/app/loading/page1">Page1</Link>
    </>
  )
}
