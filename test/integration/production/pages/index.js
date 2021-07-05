import Link from 'next/link'

const Index = () => (
  <div>
    <Link href="/about">
      <a>About Page</a>
    </Link>
    <p className="index-page">Hello World</p>
  </div>
)

export default Index
