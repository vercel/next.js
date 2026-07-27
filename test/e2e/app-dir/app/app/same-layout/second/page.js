import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="second-page">hello from same-layout/second</h1>
      <Link href="/same-layout/first" id="link">
        To First
      </Link>
    </>
  )
}
