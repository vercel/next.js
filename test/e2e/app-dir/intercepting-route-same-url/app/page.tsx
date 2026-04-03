import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <h1 id="home-page">Home Page</h1>
      <Link href="/signin" id="signin-link">
        Go to Sign In
      </Link>
    </div>
  )
}
