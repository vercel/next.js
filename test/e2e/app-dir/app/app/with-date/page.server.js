import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="date">{new Date().toString()}</h1>
      <Link href="/navigation">
        <a id="link">To Navigation</a>
      </Link>
    </>
  )
}
