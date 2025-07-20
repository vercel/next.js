import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link prefetch={false} href="/p2">
        Page 2
      </Link>
    </div>
  )
}
