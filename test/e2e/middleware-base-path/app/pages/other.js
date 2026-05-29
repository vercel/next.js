import Link from 'next/link'

export default function Other() {
  return (
    <div>
      <h1>Other page</h1>
      <Link href="/" id="go-to-home">
        Go to home
      </Link>
    </div>
  )
}
