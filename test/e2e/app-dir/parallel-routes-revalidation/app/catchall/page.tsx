import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/catchall/foobar">Dynamic Catchall Interception</Link>
    </div>
  )
}
