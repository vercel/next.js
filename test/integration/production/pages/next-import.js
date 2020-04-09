import Link from 'next/link'
// Leave below import, testing that importing "next"
// doesn't stall the build
// eslint-disable-next-line no-unused-vars
import next from 'next'

export default () => (
  <div>
    <Link href="/about">
      <a>About Page</a>
    </Link>
    <p className="index-page">Hello World</p>
  </div>
)
