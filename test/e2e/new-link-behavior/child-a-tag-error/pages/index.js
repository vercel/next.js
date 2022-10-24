import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Should Error with "a" tag</h1>
      <Link href="/">
        <a>Home</a>
      </Link>
    </>
  )
}
