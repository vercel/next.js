import { TaggedLink as Link } from './components'

export default function HomePage() {
  return (
    <div>
      <h1 data-testid="home-title">Instant Navigation API Test (blocking)</h1>
      <ul>
        <li>
          <Link href="/blocking-cookies/x">Go to blocking cookies page</Link>
        </li>
      </ul>
    </div>
  )
}
