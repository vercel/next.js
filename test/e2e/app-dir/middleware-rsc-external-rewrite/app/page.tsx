import Link from 'next/link'

export default function HomePage() {
  return (
    <div>
      <h1>Home Page</h1>
      <div id="home-content">
        <p>This is the home page</p>
        <Link href="/about" id="about-link">
          Go to About Page
        </Link>
      </div>
    </div>
  )
}
