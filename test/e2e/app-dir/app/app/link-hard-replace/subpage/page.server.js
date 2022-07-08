import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/link-hard-replace" replace>
      <a id="back-link">Self Link</a>
    </Link>
  )
}
