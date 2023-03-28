import type { NextPage } from 'next'
import Link from 'next/link'

const Home: NextPage = () => {
  return (
    <div>
      <h1>Index</h1>
      <p>
        <Link href="/about" passHref>
          Go to about page (will redirect)
        </Link>
      </p>
      <p>
        <Link href="/another" passHref>
          Go to another page (will rewrite)
        </Link>
      </p>
      <p>
        <Link href="/about2" passHref>
          Go to about 2 page (no redirect or rewrite)
        </Link>
      </p>
    </div>
  )
}

export default Home
