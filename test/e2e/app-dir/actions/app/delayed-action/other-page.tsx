import Link from 'next/link'

export default function Other() {
  return (
    <div id="other-page">
      Hello from Other Page <Link href="/delayed-action">Back</Link>
    </div>
  )
}
