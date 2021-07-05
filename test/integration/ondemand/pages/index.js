import Link from 'next/link'

const Index = () => (
  <div>
    <p>Index Page</p>
    <Link href="/about">
      <a id="about-link">About Page</a>
    </Link>
  </div>
)

export default Index
