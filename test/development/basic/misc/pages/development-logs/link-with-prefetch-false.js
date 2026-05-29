import Link from 'next/link'

export default function PrefetchFalsePage() {
  return (
    <div>
      <Link href="/about" prefetch={false}>
        Prefetch set to false
      </Link>
    </div>
  )
}
