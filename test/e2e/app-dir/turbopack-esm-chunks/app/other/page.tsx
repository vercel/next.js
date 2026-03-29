import Link from 'next/link'

export default function Other() {
  return (
    <div>
      <h1 id="other-title">Other Page</h1>
      <p id="other-content">This is the other page</p>
      <Link href="/" id="to-home">
        Go home
      </Link>
    </div>
  )
}
