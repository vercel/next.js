import Link from 'next/link'

export default function DecoderObservationsPage() {
  return (
    <Link
      id="decoder-navigation"
      href="/decoder-observations/destination"
      prefetch={false}
    >
      Observe navigation
    </Link>
  )
}
