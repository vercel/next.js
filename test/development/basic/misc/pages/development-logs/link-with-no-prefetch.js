import Link from 'next/link'

export default function NoPrefetchPage() {
  return (
    <div>
      <Link href="/about">No prefetch</Link>
    </div>
  )
}
