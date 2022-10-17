import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <Link href="/some/route/for?json=true">
        <a id="rewrite">to /some/route/for?json=true</a>
      </Link>
      <Link href="/api/json">
        <a id="direct">to /api/json</a>
      </Link>
    </div>
  )
}
