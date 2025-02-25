import Link from 'next/link'

export default function Page() {
  return (
    <p>
      hello world <Link href="/gssp">to /gssp</Link>{' '}
      <Link href="/pregenerated">to /pregenerated</Link>
    </p>
  )
}
