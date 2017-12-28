import Link from '../components/link'

// we just render a list of 3 articles having 2 with prefetched data
export default () => (
  <main>
    <h1>Next.js - with data prefetch example</h1>
    <ul>
      <li>
        <Link href='/article?id=1' prefetch withData>
          <a>Article 1</a>
        </Link>
      </li>
      <li>
        <Link href='/article?id=2' prefetch>
          <a>Article 2</a>
        </Link>
      </li>
      <li>
        <Link href='/article?id=3' prefetch withData>
          <a>Article 3</a>
        </Link>
      </li>
    </ul>
  </main>
)
