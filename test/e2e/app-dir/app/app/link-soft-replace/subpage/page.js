import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/link-soft-replace" replace id="back-link">
      Self Link
    </Link>
  )
}
