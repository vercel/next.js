import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/photos/a/b">multi</Link>
      <Link href="/photos/only">single</Link>
    </div>
  )
}
