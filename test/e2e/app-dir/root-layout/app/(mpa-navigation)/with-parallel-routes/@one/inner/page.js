import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/dynamic/first/hello">To dynamic route</Link>
      <p id="parallel-one-inner">One inner</p>
    </>
  )
}
