import Link from 'next/link'
import { NextPage } from 'next'

const Home: NextPage = () => {
  return (
    <ul>
      <li>
        <Link href="/b" as="/a">
          <a>a</a>
        </Link>
      </li>
      <li>
        <Link href="/a" as="/b">
          <a>b</a>
        </Link>
      </li>
    </ul>
  )
}

export default Home
