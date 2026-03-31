import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div>
        <Link href="/internal/test/rewrite" id="navigate-rewrite">
          Navigate Rewrite
        </Link>
      </div>
      <div>
        <Link href="/internal/test/redirect" id="navigate-redirect">
          Navigate Redirect
        </Link>
      </div>
    </div>
  )
}
