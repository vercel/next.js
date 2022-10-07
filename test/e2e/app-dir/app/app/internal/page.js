import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <div>
        <Link href="/internal/test/rewrite">
          <a id="navigate-rewrite">Navigate Rewrite</a>
        </Link>
      </div>
      <div>
        <Link href="/internal/test/redirect">
          <a id="navigate-redirect">Navigate Redirect</a>
        </Link>
      </div>
    </div>
  )
}
