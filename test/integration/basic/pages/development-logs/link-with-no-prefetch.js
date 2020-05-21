import Link from 'next/link'

export default function NoPrefetchPage() {
  return (
    <div>
      <Link href="/about">
        <a>No prefetch</a>
      </Link>
    </div>
  )
}
