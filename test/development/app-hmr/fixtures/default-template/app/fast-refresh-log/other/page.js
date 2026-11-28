import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="other">Other</p>
      <Link href="/fast-refresh-log" id="to-home">
        Back
      </Link>
    </>
  )
}
