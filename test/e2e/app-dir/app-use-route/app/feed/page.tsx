import { RouteDisplay } from '../components/route-display'
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Feed</h1>
      <RouteDisplay testId="feed-page" />
      <Link href="/feed/photo/123" id="link-to-photo">
        View Photo 123
      </Link>
    </div>
  )
}
