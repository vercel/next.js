import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 id="home-page">Home Page</h1>
      <Link href="/about" id="link-to-about">
        Go to About
      </Link>
    </div>
  )
}
