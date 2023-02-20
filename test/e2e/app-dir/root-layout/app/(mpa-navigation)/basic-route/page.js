import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/basic-route/inner">To inner basic route</Link>
      <p id="basic-route">Basic route</p>
    </>
  )
}
