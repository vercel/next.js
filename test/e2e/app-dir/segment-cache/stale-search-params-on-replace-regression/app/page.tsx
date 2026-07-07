import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="home">Home</h1>
      <Link id="link-to-dummy-1" href="/dummy-page-1">
        Go to dummy page 1
      </Link>
    </>
  )
}
