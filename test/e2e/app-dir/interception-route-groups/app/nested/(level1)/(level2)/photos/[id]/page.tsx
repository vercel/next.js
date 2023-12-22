import Link from 'next/link'

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div>
      Photo Page (non-intercepted) {params.id}{' '}
      <Link href="/nested">Back to /nested</Link>
    </div>
  )
}
