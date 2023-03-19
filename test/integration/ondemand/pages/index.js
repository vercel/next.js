import Link from 'next/link'

export default () => (
  <div>
    <p>Index Page</p>
    <Link href="/about" id="about-link">
      About Page
    </Link>
  </div>
)
