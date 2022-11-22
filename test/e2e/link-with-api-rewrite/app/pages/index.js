import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/some/route/for?json=true" id="rewrite">
        to /some/route/for?json=true
      </Link>
      <Link href="/api/json" id="direct">
        to /api/json
      </Link>
    </div>
  )
}
