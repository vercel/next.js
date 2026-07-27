import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/with-parallel-routes/inner">To parallel inner</Link>
      <p id="parallel-one">One</p>
    </>
  )
}
