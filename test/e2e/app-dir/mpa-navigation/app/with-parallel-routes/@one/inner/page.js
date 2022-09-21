import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/basic-route/inner">To basic route inner</Link>
      <p id="parallel-one-inner">One inner</p>
    </>
  )
}
