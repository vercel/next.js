import Link from 'next/link'

export default function Page() {
  return (
    <div id="root-page">
      <h2>Root Page</h2>
      <div>
        <Link href="/foobar">To /foobar (catchall)</Link>
      </div>
    </div>
  )
}
