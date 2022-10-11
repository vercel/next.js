import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/with-parallel-routes">To with-parallel-routes</Link>
      <p id="nested-route-group">Nested route group</p>
    </>
  )
}
