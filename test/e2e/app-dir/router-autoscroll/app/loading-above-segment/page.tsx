import Link from 'next/link'

export default function Page() {
  return (
    <>
      {
        // Repeat 500 elements
        Array.from({ length: 500 }, (_, i) => (
          <div key={i}>{i}</div>
        ))
      }
      <Link href="/loading-above-segment/slow" id="to-slow">
        To slow
      </Link>
      <Link href="/loading-above-segment/slow#hash-target" id="to-slow-hash">
        To slow with hash
      </Link>
    </>
  )
}
