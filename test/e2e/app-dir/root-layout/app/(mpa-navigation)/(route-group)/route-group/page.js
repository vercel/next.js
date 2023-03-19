import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/nested-route-group">To nested route group</Link>
      <p id="route-group">Route group</p>
    </>
  )
}
