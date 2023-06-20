import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="https://example.vercel.sh/" id="external-link" replace>
        External Link
      </Link>
    </>
  )
}
