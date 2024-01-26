import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/nested/photos/1">Photo 1</Link>{' '}
      <Link href="/nested/photos/2">Photo 2</Link>
    </div>
  )
}
