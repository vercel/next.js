import { RouteDisplay } from '../components/route-display'
import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Gallery</h1>
      <RouteDisplay testId="gallery-page" />
      <Link href="/gallery/123" id="link-to-photo">
        View Photo 123
      </Link>
    </div>
  )
}
