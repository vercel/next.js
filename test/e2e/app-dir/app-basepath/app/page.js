import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Test Page</h1>
      <Link href="/another">Go to page 2</Link>
    </div>
  )
}
