import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="first-page">hello from same-layout/first</h1>
      <Link href="/same-layout/second">
        <a id="link">To Second</a>
      </Link>
    </>
  )
}
