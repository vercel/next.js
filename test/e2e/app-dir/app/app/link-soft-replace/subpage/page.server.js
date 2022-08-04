import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/link-soft-replace" soft replace>
      <a id="back-link">Self Link</a>
    </Link>
  )
}
