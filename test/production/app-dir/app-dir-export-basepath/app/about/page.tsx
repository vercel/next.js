import Link from 'next/link'

export default function AboutPage() {
  return (
    <div>
      <h1 id="about-page">About Page</h1>
      <Link href="/" id="link-to-home">
        Go to Home
      </Link>
    </div>
  )
}
