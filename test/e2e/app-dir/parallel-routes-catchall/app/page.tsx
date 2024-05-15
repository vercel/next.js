import Link from 'next/link'

export default async function Home() {
  return (
    <div>
      <div>
        <Link href="/foo">Go to /foo (page & slot)</Link>
      </div>
      <div>
        <Link href="/bar">Go to /bar (page & no slot)</Link>
      </div>
      <div>
        <Link href="/baz">Go to /baz (no page & slot)</Link>
      </div>
      <div>
        <Link href="/quux">Go to /quux (no page & no slot)</Link>
      </div>
    </div>
  )
}
