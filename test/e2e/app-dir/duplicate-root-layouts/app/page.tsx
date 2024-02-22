import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/photos/1">Photo 1</Link>{' '}
      <Link href="/photos/2">Photo 2</Link>
      <hr />
      <Link href="/nested">To /nested</Link>
    </div>
  )
}
