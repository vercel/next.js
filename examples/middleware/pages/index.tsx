import type { NextPage } from 'next'
import Link from 'next/link'

const Home: NextPage = () => {
  return (
    <div>
      <h1>Index</h1>
      <p>
        <Link href="/about" passHref>
          <a>Go to about page (will redirect)</a>
        </Link>
      </p>
      <p>
        <Link href="/another" passHref>
          <a>Go to another page (will rewrite)</a>
        </Link>
      </p>
      <p>
        <Link href="/about2" passHref>
          <a>Go to about 2 page (no redirect or rewrite)</a>
        </Link>
      </p>
    </div>
  )
}

export default Home
